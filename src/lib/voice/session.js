// The Live Voice conversation engine. No React and no device APIs in here:
// the microphone, speech recogniser, AI and speaker are handed in, so the
// whole turn-taking logic can be tested on its own.
//
//   listener   { start(onLevel), cut(), discard(), release(segment), stop() }
//                keeps the microphone open and records in segments. cut() ends
//                the current segment (returns it) and starts the next one.
//   transcribe (segment, { language, signal }) -> { ok, text, language } | { ok:false, error }
//   respond    ({ text, lang, history, settings, signal }) -> { ok, reply, to, from } | { ok:false, error }
//   speaker    { speak(text, lang, { rate }) -> { spoken }, stop() }
//
// One turn: hear -> (pause) -> transcribe -> maybe wait for an unfinished
// sentence -> translate / think -> speak -> listen again. Speaking over the
// assistant, or while it is thinking, takes over smoothly.

import { createVad } from './vad';
import { holdMsFor, isCompleteThought, mergeTranscripts } from './endpointing';
import { languageName, normalizeLangCode } from './languages';
import { SENSITIVITY_MARGIN_DB, sanitizeSettings } from './settings';
import { splitSentences } from './speechText';
import { cleanSpeechText } from './speechMeta';
import { tr } from '../../i18n/current';

export const STATES = {
  IDLE: 'idle',
  STARTING: 'starting',
  LISTENING: 'listening', // waiting for you to speak
  HEARING: 'hearing', // you are speaking
  HOLDING: 'holding', // you paused mid-sentence; waiting a little longer
  TRANSCRIBING: 'transcribing',
  THINKING: 'thinking', // conversation: working out a reply | interpreter: translating
  SPEAKING: 'speaking',
  PAUSED: 'paused', // microphone muted
  ERROR: 'error',
};

const MIN_UTTERANCE_MS = 250; // anything shorter is a bump or a click, not speech
const SPEAKING_EXTRA_MARGIN_DB = 8; // interrupting must be clearly louder than echo from the speaker
const SPEAKING_MIN_SPEECH_MS = 450;
const ROTATE_IDLE_MS = 6000; // start a fresh recording when nothing has been said for a while
const TAIL_GUARD_MS = 350; // ignore the last echo of our own voice
const MAX_HOLDS = 2;
const HISTORY_LIMIT = 12;
const SENTENCE_PAUSE_MS = 140;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class VoiceSession {
  constructor({ listener, transcribe, respond, speaker, getSettings, onState, onCaption, onTurn, onLevel, onNotice, onError, onActions, initialHistory = [], now = () => Date.now() }) {
    this.listener = listener;
    this.transcribe = transcribe;
    this.respond = respond;
    this.speaker = speaker;
    this.getSettings = () => sanitizeSettings(getSettings ? getSettings() : {});
    this.cb = { onState, onCaption, onTurn, onLevel, onNotice, onError, onActions };
    this.stickyLang = null; // a language the person asked for mid-conversation ("speak Afrikaans")
    this.supersedes = null; // id of a turn that was cut short and re-sent with more words
    this.now = now;

    this.vad = createVad();
    this.state = STATES.IDLE;
    this.running = false;
    this.muted = false;

    this.pending = null; // what has been said so far this turn: { text, lang, langLen, captionId, parts }
    this.holds = 0;
    this.holdTimer = null;
    this.inflightSegments = 0;
    this.transcriptChain = Promise.resolve();
    this.turn = null; // the reply being worked on: { id, abort, data }
    this.turnSeq = 0;
    this.captionSeq = 0;
    this.history = initialHistory.slice(-HISTORY_LIMIT);
    this.speakToken = 0;
    this.speaking = null; // { sentences, spoken, aid, historyIndex }
    this.ignoreUntil = 0;
    this.segmentStartedAt = 0;
    this.rotating = false;
    this.lastLevelAt = 0;
    this.noVoiceTold = new Set();
  }

  /* ---------------- public ---------------- */

  async start() {
    if (this.running) return { ok: true };
    this.running = true;
    this._setState(STATES.STARTING);
    try {
      await this.listener.start((db) => this._handleLevel(db));
    } catch (e) {
      this.running = false;
      this._setState(STATES.ERROR, { message: e?.message });
      this.cb.onError?.(e?.message || tr('vs.noMic'), { denied: e?.code === 'permission', blocked: Boolean(e?.blocked) });
      return { ok: false, error: e?.message, denied: e?.code === 'permission' };
    }
    this.vad.reset({ keepFloor: false });
    this.segmentStartedAt = this.now();
    this._setState(this._idleState());
    return { ok: true };
  }

  async stop() {
    if (!this.running && this.state === STATES.IDLE) return;
    this.running = false;
    clearTimeout(this.holdTimer);
    this.turn?.abort.abort();
    this.turn = null;
    this.pending = null;
    this.holds = 0;
    this.speakToken++;
    this.speaking = null;
    try {
      await this.speaker?.stop();
    } catch (e) {
      /* nothing to stop */
    }
    try {
      await this.listener.stop();
    } catch (e) {
      /* already closed */
    }
    this._setState(STATES.IDLE);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (!this.running) return;
    if (this.muted) {
      this.vad.reset();
      clearTimeout(this.holdTimer);
      this.listener.discard?.();
      this.segmentStartedAt = this.now();
      if (this.pending) this._commit(); // send what was already said
      else if ([STATES.LISTENING, STATES.HEARING, STATES.HOLDING, STATES.TRANSCRIBING].includes(this.state)) this._setState(STATES.PAUSED);
    } else if (this.state === STATES.PAUSED) {
      this._setState(STATES.LISTENING);
    }
  }

  /** Manual: stop the assistant talking (or cancel a reply that is still being worked out). */
  interrupt() {
    if (this.state === STATES.SPEAKING) {
      this._interruptSpeech();
      this._setState(this._idleState());
    } else if (this.state === STATES.THINKING && this.turn) {
      this.turn.abort.abort();
      this.turn = null;
      this._setState(this._idleState());
    }
  }

  /** Manual: don't wait for the pause, send what has been said. */
  sendNow() {
    if (this.pending && (this.state === STATES.HOLDING || this.state === STATES.TRANSCRIBING)) {
      clearTimeout(this.holdTimer);
      this._commit();
    }
  }

  /* ---------------- internals ---------------- */

  _idleState() {
    return this.muted ? STATES.PAUSED : STATES.LISTENING;
  }

  _setState(state, info = {}) {
    if (this.state === state && !Object.keys(info).length) return;
    this.state = state;
    this.cb.onState?.(state, info);
  }

  _handleLevel(db) {
    if (!this.running) return;
    const t = this.now();

    if (t - this.lastLevelAt >= 50) {
      this.lastLevelAt = t;
      this.cb.onLevel?.({ db, floor: this.vad.floor, threshold: this.vad.threshold, speech: this.vad.inSpeech });
    }
    if (this.muted) return;

    const s = this.getSettings();
    const speaking = this.state === STATES.SPEAKING;
    if (speaking && !s.interrupt) {
      this.vad.reset();
      return;
    }
    if (speaking && t < this.ignoreUntil) return;

    this.vad.setOptions({
      marginDb: SENSITIVITY_MARGIN_DB[s.sensitivity] + (speaking ? SPEAKING_EXTRA_MARGIN_DB : 0),
      minSpeechMs: speaking ? SPEAKING_MIN_SPEECH_MS : 160,
      silenceMs: s.pauseMs,
    });

    for (const e of this.vad.push(db, t)) {
      if (e.type === 'start') this._onSpeechStart();
      else this._onSpeechEnd(e);
    }

    // Nothing said for a while: begin a fresh recording so the file never grows large.
    if (!this.vad.inSpeech && !this.rotating && this.state !== STATES.HEARING && t - this.segmentStartedAt > ROTATE_IDLE_MS) {
      this.rotating = true;
      Promise.resolve(this.listener.discard?.())
        .catch(() => {})
        .finally(() => {
          this.segmentStartedAt = this.now();
          this.rotating = false;
        });
    }
  }

  _onSpeechStart() {
    if (this.state === STATES.SPEAKING) {
      this._interruptSpeech(); // talking over the assistant
    } else if (this.state === STATES.THINKING) {
      // Still working out the last reply and they carried on: treat it as one longer message.
      if (this.turn) {
        this.turn.abort.abort();
        this.pending = this.turn.data;
        this.supersedes = this.turn.turnId; // the server then knows what the first attempt may already have done
        this.turn = null;
      }
    }
    clearTimeout(this.holdTimer);
    this._setState(STATES.HEARING);
  }

  async _onSpeechEnd(event) {
    let segment = null;
    try {
      segment = await this.listener.cut();
    } catch (e) {
      segment = null;
    }
    this.segmentStartedAt = this.now();
    if (!this.running) return;

    if (!segment || event.durationMs < MIN_UTTERANCE_MS) {
      if (segment) this.listener.release?.(segment);
      this._settle();
      return;
    }

    this.inflightSegments++;
    if (!this.vad.inSpeech) this._setState(STATES.TRANSCRIBING);

    const s = this.getSettings();
    const abort = new AbortController();
    const result = Promise.resolve()
      .then(() => this.transcribe(segment, { language: s.inputLang, signal: abort.signal }))
      .catch((e) => ({ ok: false, error: e?.message || tr('vs.noUnderstand') }));

    // Results are applied in the order they were spoken, even if a later one comes back first.
    this.transcriptChain = this.transcriptChain.then(() => result).then((res) => {
      this.listener.release?.(segment);
      this.inflightSegments--;
      if (this.running) this._afterTranscript(res, s);
    });
  }

  /** A noise blip or failed transcription: go back to whatever we were doing. */
  _settle() {
    if (!this.running) return;
    if (this.vad.inSpeech) this._setState(STATES.HEARING);
    else if (this.inflightSegments > 0) this._setState(STATES.TRANSCRIBING);
    else if (this.pending) this._decide();
    else if (this.turn) this._setState(STATES.THINKING);
    else if (this.state !== STATES.SPEAKING) this._setState(this._idleState());
  }

  _afterTranscript(res, settings) {
    if (!res || !res.ok) {
      this.cb.onError?.(res?.error || tr('vs.noUnderstand'), { transient: true });
      this._settle();
      return;
    }
    // Only the words spoken (a server without the latest clean-up could still send markers).
    const text = cleanSpeechText(res.text);
    if (!text) {
      this._settle();
      return;
    }

    const lang = settings.inputLang !== 'auto' ? settings.inputLang : normalizeLangCode(res.language);
    if (this.pending) {
      this.pending.text = mergeTranscripts(this.pending.text, text);
      this.pending.parts++;
      // A longer snippet gives a more trustworthy language guess than a short one.
      if (lang && text.length >= this.pending.langLen) {
        this.pending.lang = lang;
        this.pending.langLen = text.length;
      }
    } else {
      this.pending = { text, lang, langLen: text.length, captionId: `u${++this.captionSeq}`, parts: 1 };
    }
    this.cb.onCaption?.({ id: this.pending.captionId, role: 'user', text: this.pending.text, lang: this.pending.lang, final: false });

    if (this.vad.inSpeech || this.inflightSegments > 0) return; // more is coming
    this._decide();
  }

  /** Is this a finished thought, or should we give them a little longer? */
  _decide() {
    if (!this.pending) return this._settle();
    const s = this.getSettings();
    if (!isCompleteThought(this.pending.text) && this.holds < MAX_HOLDS && !this.muted) {
      this.holds++;
      this._setState(STATES.HOLDING);
      clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        if (this.state === STATES.HOLDING) this._commit();
      }, holdMsFor(s.pauseMs));
      return;
    }
    this._commit();
  }

  async _commit() {
    const data = this.pending;
    if (!data) return;
    this.pending = null;
    this.holds = 0;
    clearTimeout(this.holdTimer);

    const s = this.getSettings();
    const id = ++this.turnSeq;
    const abort = new AbortController();
    const turnId = `t${id}-${Math.random().toString(36).slice(2, 8)}`;
    this.turn = { id, abort, data, turnId };
    const supersedes = this.supersedes;
    this.supersedes = null;
    this._setState(STATES.THINKING, { mode: s.mode });
    this.cb.onCaption?.({ id: data.captionId, role: 'user', text: data.text, lang: data.lang, final: true });

    let res;
    try {
      res = await this.respond({ text: data.text, lang: data.lang, history: this.history.slice(-HISTORY_LIMIT), settings: s, signal: abort.signal, turnId, supersedes, sticky: this.stickyLang });
    } catch (e) {
      res = { ok: false, error: e?.name === 'AbortError' ? null : e?.message };
    }
    if (!this.turn || this.turn.id !== id) return; // they spoke again, or stopped: this answer is out of date
    this.turn = null;
    if (!this.running) return;

    if (!res || !res.ok || !String(res.reply || '').trim()) {
      this.cb.onError?.(res?.error || tr('vs.noAnswer'), { transient: true });
      this._setState(this._idleState());
      return;
    }

    const reply = cleanSpeechText(res.reply);
    if (!reply) {
      this.cb.onError?.(tr('vs.noAnswer'), { transient: true });
      this._setState(this._idleState());
      return;
    }
    const to = normalizeLangCode(res.to) || data.lang || 'en';
    if (res.sticky !== undefined) this.stickyLang = res.sticky === 'auto' ? null : normalizeLangCode(res.sticky);
    // The AI hears the words themselves, so its idea of the spoken language beats a guess from a short clip.
    const heard = s.mode === 'conversation' ? normalizeLangCode(res.from) : null;
    if (heard && heard !== data.lang) {
      data.lang = heard;
      this.cb.onCaption?.({ id: data.captionId, role: 'user', text: data.text, lang: heard, final: true });
    }
    if (res.actions?.length || res.changed?.length) this.cb.onActions?.({ actions: res.actions || [], changed: res.changed || [] });
    const aid = `a${id}`;
    let historyIndex = -1;
    if (s.mode === 'conversation') {
      this.history.push({ role: 'user', content: data.text });
      historyIndex = this.history.push({ role: 'assistant', content: reply }) - 1;
      if (this.history.length > HISTORY_LIMIT * 2) this.history = this.history.slice(-HISTORY_LIMIT * 2);
    }
    this.cb.onCaption?.({ id: aid, role: 'assistant', text: reply, lang: to, from: normalizeLangCode(res.from) || data.lang, mode: s.mode, final: true, actions: res.actions?.length ? res.actions : undefined });
    this.cb.onTurn?.({ mode: s.mode, user: { text: data.text, lang: data.lang }, assistant: { text: reply, lang: to } });

    if (!s.speak) {
      this._setState(this._idleState());
      return;
    }
    await this._speak(reply, to, aid, historyIndex, s);
  }

  async _speak(reply, lang, aid, historyIndex, settings) {
    const token = ++this.speakToken;
    const sentences = splitSentences(reply);
    this.speaking = { sentences, spoken: 0, aid, historyIndex };
    this.vad.reset();
    this._setState(STATES.SPEAKING, { lang });

    for (let i = 0; i < sentences.length; i++) {
      if (token !== this.speakToken || !this.running) return;
      this.speaking.spoken = i;
      let r;
      try {
        r = await this.speaker.speak(sentences[i], lang, { rate: settings.speed });
      } catch (e) {
        r = { spoken: false, reason: 'error' };
      }
      if (token !== this.speakToken || !this.running) return;
      if (r && r.spoken === false && r.reason === 'no-voice') {
        if (!this.noVoiceTold.has(lang)) {
          this.noVoiceTold.add(lang);
          this.cb.onNotice?.(tr('vs.noVoice', { language: languageName(lang) }), { lang });
        }
        break;
      }
      if (i < sentences.length - 1) await wait(SENTENCE_PAUSE_MS);
    }
    if (token !== this.speakToken || !this.running) return;

    this.speaking = null;
    this.ignoreUntil = this.now() + TAIL_GUARD_MS;
    this.vad.reset();
    this._setState(this._idleState());
  }

  /** The person spoke over the assistant (or tapped stop). Cut the voice and remember only what was said. */
  _interruptSpeech() {
    const sp = this.speaking;
    this.speakToken++;
    this.speaking = null;
    try {
      this.speaker?.stop();
    } catch (e) {
      /* nothing playing */
    }
    if (sp) {
      if (sp.historyIndex >= 0 && this.history[sp.historyIndex]) {
        const said = sp.sentences.slice(0, sp.spoken + 1).join(' ');
        this.history[sp.historyIndex] = { role: 'assistant', content: `${said} [the user interrupted here]` };
      }
      this.cb.onCaption?.({ id: sp.aid, role: 'assistant', interrupted: true });
    }
    this.vad.reset();
  }
}
