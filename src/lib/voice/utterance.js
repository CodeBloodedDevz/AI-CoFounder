// One spoken message, ended automatically when the person stops talking (like ChatGPT's voice input).
// Used by the chat microphone and Voice Notes; Live Voice uses the continuous session (session.js) with
// the same microphone (micListener) and the same voice-activity detection (vad.js).
//
//  - The microphone records from the moment it opens, so nothing at the start of a sentence is lost.
//  - vad.js learns the background noise and only counts sound clearly above it as speech (the
//    "sensitivity" margin), ignores clicks and steady noise (fans, traffic), and calls the message
//    finished after `silenceMs` of quiet (the adjustable "pause before sending").
//  - The recording is delivered exactly once: by the pause, by a tap on stop, or by the length limit.
//  - If nobody speaks within `noSpeechMs` it stops and says so instead of sending silence.
//
//   const cap = createUtteranceCapture({ listener, makeVad: (opts) => createVad(opts), vadOptions, onState, onLevel });
//   const result = await cap.start();  // resolves when done:
//       { ok: true, uri, durationMs }  |  { empty: true }  |  { cancelled: true }  |  { ok: false, error, denied, blocked }
//   cap.finish()  // stop now and send what was said      cap.cancel()  // stop and throw it away

export const MIN_SPEECH_RECORDING_MS = 600;
// The first moments are used to measure the room's background level, so a noisy room doesn't count as
// speech and a quiet room catches soft voices. Readings from that time are still checked for speech.
export const CALIBRATION_MS = 300;

export function createUtteranceCapture({ listener, makeVad, vadOptions = {}, onState, onLevel, noSpeechMs = 8000, now = () => Date.now() }) {
  let vad = null;
  const calibration = [];
  let state = 'idle'; // idle | starting | listening | hearing | finishing | done
  let resolveResult;
  const result = new Promise((r) => (resolveResult = r));
  let startedAt = 0;
  let heardSpeech = false;
  let settled = false;

  const setState = (s) => {
    state = s;
    onState?.(s);
  };

  async function settle(value) {
    if (settled) return;
    settled = true;
    setState('done');
    resolveResult(value);
  }

  async function finalize(reason) {
    if (state === 'finishing' || state === 'done') return; // one delivery only
    setState('finishing');
    if (!heardSpeech || reason === 'cancel') {
      try {
        await listener.stop();
      } catch (e) {
        /* already stopped */
      }
      return settle(reason === 'cancel' ? { cancelled: true } : { empty: true });
    }
    let segment = null;
    try {
      segment = await listener.cut();
    } catch (e) {
      segment = null;
    }
    try {
      await listener.stop();
    } catch (e) {
      /* already stopped */
    }
    if (!segment?.uri) return settle({ ok: false, error: 'recording_failed' });
    if ((segment.durationMs || 0) < MIN_SPEECH_RECORDING_MS) {
      listener.release?.(segment);
      return settle({ empty: true, tooShort: true });
    }
    return settle({ ok: true, uri: segment.uri, durationMs: segment.durationMs, reason });
  }

  function feed(db, t) {
    for (const e of vad.push(db, t)) {
      if (e.type === 'start') {
        heardSpeech = true;
        setState('hearing');
      } else if (e.type === 'end') {
        // A steady sound mistaken for speech (a fan starting, a passing car): keep listening.
        if (e.reason === 'noise') {
          heardSpeech = false;
          setState('listening');
          continue;
        }
        finalize(e.reason === 'max' ? 'max' : 'pause');
        return false;
      }
    }
    return true;
  }

  function onDb(db) {
    if (state !== 'listening' && state !== 'hearing') return;
    if (!Number.isFinite(db)) return;
    const t = now();
    if (!vad) {
      calibration.push({ db, t });
      if (t - startedAt < CALIBRATION_MS) return;
      const quietest = Math.min(...calibration.map((c) => c.db));
      vad = makeVad({ ...vadOptions, floorInitDb: Math.min(-40, Math.max(-80, quietest - 1)) });
      for (const c of calibration) if (!feed(c.db, c.t)) return;
      return;
    }
    onLevel?.({ db, floor: vad.floor, threshold: vad.threshold, speech: vad.inSpeech });
    if (!feed(db, t)) return;
    if (!heardSpeech && t - startedAt > noSpeechMs) finalize('no_speech');
  }

  return {
    get state() {
      return state;
    },
    async start() {
      if (state !== 'idle') return result;
      setState('starting');
      try {
        await listener.start(onDb);
      } catch (e) {
        settled = true;
        setState('done');
        return { ok: false, error: e?.message || 'mic', denied: e?.code === 'permission', blocked: Boolean(e?.blocked) };
      }
      startedAt = now();
      setState('listening');
      return result;
    },
    /** Tap on stop: send what has been said (nothing said yet = nothing sent). */
    finish() {
      if (state === 'starting') return; // the microphone is still opening
      if (state === 'listening' || state === 'hearing') finalize('tap');
    },
    cancel() {
      if (state === 'listening' || state === 'hearing' || state === 'starting') finalize('cancel');
    },
  };
}
