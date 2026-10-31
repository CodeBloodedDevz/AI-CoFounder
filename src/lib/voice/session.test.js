import { VoiceSession, STATES } from './session';

// ---- fakes ----
const LOUD = -20;
const QUIET = -65;

function setup(overrides = {}) {
  const log = { states: [], captions: [], turns: [], errors: [], notices: [], actions: [], cuts: 0, discards: 0, speaks: [], stops: 0 };
  let onLevel;
  const listener = {
    start: jest.fn(async (cb) => { onLevel = cb; }),
    cut: jest.fn(async () => { log.cuts++; return { id: `seg${log.cuts}` }; }),
    discard: jest.fn(async () => { log.discards++; }),
    release: jest.fn(),
    stop: jest.fn(async () => {}),
  };
  const transcripts = overrides.transcripts || [{ ok: true, text: 'How is my business doing?', language: 'english' }];
  let tIndex = 0;
  const transcribe = jest.fn(async () => transcripts[Math.min(tIndex++, transcripts.length - 1)]);
  const respond = jest.fn(overrides.respond || (async ({ text }) => ({ ok: true, reply: `Answer to ${text}. Anything else?`, to: 'en', from: 'en' })));
  let resolveSpeak;
  const speaker = {
    speak: jest.fn((text) => new Promise((resolve) => { log.speaks.push(text); resolveSpeak = () => resolve({ spoken: true }); if (overrides.autoSpeak !== false) setTimeout(() => resolve({ spoken: true }), 300); })),
    stop: jest.fn(() => { log.stops++; resolveSpeak?.(); }),
  };
  const settings = { pauseMs: 1000, interrupt: true, speak: true, mode: 'conversation', ...(overrides.settings || {}) };
  const session = new VoiceSession({
    listener, transcribe, respond, speaker, getSettings: () => settings,
    onState: (s) => log.states.push(s),
    onCaption: (c) => log.captions.push(c),
    onTurn: (t) => log.turns.push(t),
    onError: (e) => log.errors.push(e),
    onNotice: (n) => log.notices.push(n),
    onActions: (a) => log.actions.push(a),
  });
  // Drive audio levels: one reading every 50 ms of fake time.
  let k = 0;
  const feed = async (db, ms) => {
    for (let t = 0; t < ms; t += 50) {
      onLevel(db + (k++ % 2 ? 4 : -4)); // real audio is never perfectly steady
      jest.advanceTimersByTime(50);
      await Promise.resolve();
    }
  };
  const flush = async (ms = 0) => { jest.advanceTimersByTime(ms); for (let i = 0; i < 8; i++) await Promise.resolve(); };
  return { session, listener, transcribe, respond, speaker, log, settings, feed, flush };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function speakThenPause(h, speechMs = 1500, pauseMs = 1300) {
  await h.feed(QUIET, 400); // calibrate
  await h.feed(LOUD, speechMs);
  await h.feed(QUIET, pauseMs);
  await h.flush();
}

describe('automatic sending on a pause', () => {
  it('sends by itself once the person stops, without any button', async () => {
    const h = setup();
    await h.session.start();
    expect(h.log.states.at(-1)).toBe(STATES.LISTENING);

    await h.feed(QUIET, 400);
    await h.feed(LOUD, 1500);
    expect(h.session.state).toBe(STATES.HEARING);
    await h.feed(QUIET, 600); // shorter than the 1 s threshold: still waiting
    expect(h.listener.cut).not.toHaveBeenCalled();
    expect(h.session.state).toBe(STATES.HEARING);

    await h.feed(QUIET, 600);
    await h.flush();
    expect(h.listener.cut).toHaveBeenCalledTimes(1);
    expect(h.transcribe).toHaveBeenCalledTimes(1);
    expect(h.respond).toHaveBeenCalledTimes(1);
    expect(h.log.states).toEqual(expect.arrayContaining([STATES.HEARING, STATES.TRANSCRIBING, STATES.THINKING, STATES.SPEAKING]));
    expect(h.log.turns[0]).toMatchObject({ user: { text: 'How is my business doing?', lang: 'en' }, assistant: { lang: 'en' } });
  });

  it('respects a longer, adjustable pause threshold', async () => {
    const h = setup({ settings: { pauseMs: 2000 } });
    await h.session.start();
    await h.feed(QUIET, 400);
    await h.feed(LOUD, 1500);
    await h.feed(QUIET, 1500);
    expect(h.listener.cut).not.toHaveBeenCalled(); // 1.5 s < 2 s
    await h.feed(QUIET, 700);
    await h.flush();
    expect(h.listener.cut).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks and bumps that are too short to be speech', async () => {
    const h = setup();
    await h.session.start();
    await h.feed(QUIET, 400);
    await h.feed(LOUD, 100);
    await h.feed(QUIET, 1500);
    await h.flush();
    expect(h.transcribe).not.toHaveBeenCalled();
    expect(h.session.state).toBe(STATES.LISTENING);
  });
});

describe('unfinished sentences', () => {
  it('waits when the sentence trails off, and joins the two parts into one message', async () => {
    const h = setup({ transcripts: [{ ok: true, text: 'I want to know about', language: 'english' }, { ok: true, text: 'my stock levels.', language: 'english' }] });
    await h.session.start();
    await speakThenPause(h);
    expect(h.session.state).toBe(STATES.HOLDING);
    expect(h.respond).not.toHaveBeenCalled();

    await h.feed(LOUD, 1400); // they carry on
    expect(h.session.state).toBe(STATES.HEARING);
    await h.feed(QUIET, 1300);
    await h.flush();

    expect(h.respond).toHaveBeenCalledTimes(1);
    expect(h.respond.mock.calls[0][0].text).toBe('I want to know about my stock levels.');
  });

  it('sends anyway if they never continue', async () => {
    const h = setup({ transcripts: [{ ok: true, text: 'Tell me about,', language: 'english' }] });
    await h.session.start();
    await speakThenPause(h);
    expect(h.session.state).toBe(STATES.HOLDING);
    await h.flush(2000);
    await h.flush();
    expect(h.respond).toHaveBeenCalledTimes(1);
    expect(h.respond.mock.calls[0][0].text).toBe('Tell me about,');
  });

  it('can be sent immediately with sendNow', async () => {
    const h = setup({ transcripts: [{ ok: true, text: 'And then', language: 'english' }] });
    await h.session.start();
    await speakThenPause(h);
    expect(h.session.state).toBe(STATES.HOLDING);
    h.session.sendNow();
    await h.flush();
    expect(h.respond).toHaveBeenCalledTimes(1);
  });
});

describe('assistant actions, language and re-sent turns', () => {
  it('a turn that was extended is re-sent with the id of the first attempt, so nothing is done twice', async () => {
    let release;
    const h = setup({
      transcripts: [{ ok: true, text: 'Add a product Snacks quantity 200', language: 'english' }, { ok: true, text: 'bought price R8', language: 'english' }],
      respond: jest.fn(({ signal, text }) => new Promise((resolve) => { release = () => resolve({ ok: true, reply: `Done: ${text}`, to: 'en' }); signal.addEventListener('abort', () => resolve({ ok: false, error: null })); })),
    });
    await h.session.start();
    await speakThenPause(h);
    const first = h.respond.mock.calls[0][0];
    expect(first.turnId).toBeTruthy();
    expect(first.supersedes).toBeNull();
    await h.feed(LOUD, 1400);
    await h.feed(QUIET, 1300);
    await h.flush();
    const second = h.respond.mock.calls[1][0];
    expect(second.text).toBe('Add a product Snacks quantity 200 bought price R8');
    expect(second.supersedes).toBe(first.turnId);
    expect(second.turnId).not.toBe(first.turnId);
    release();
    await h.flush();
  });

  it('remembers a language the person asked for and sends it with the next turn', async () => {
    const h = setup({
      transcripts: [{ ok: true, text: 'Please speak Afrikaans', language: 'english' }, { ok: true, text: 'How are sales?', language: 'english' }],
      respond: jest.fn(async ({ text }) => (/Afrikaans/.test(text) ? { ok: true, reply: 'Goed.', to: 'af', from: 'en', sticky: 'af' } : { ok: true, reply: 'Verkope is goed.', to: 'af', from: 'en' })),
    });
    await h.session.start();
    await speakThenPause(h);
    await h.flush(3000);
    await speakThenPause(h);
    expect(h.respond.mock.calls[0][0].sticky).toBeNull();
    expect(h.respond.mock.calls[1][0].sticky).toBe('af');
  });

  it('"auto" from the server clears the remembered language', async () => {
    const h = setup({
      transcripts: [{ ok: true, text: 'one', language: 'english' }, { ok: true, text: 'two', language: 'english' }, { ok: true, text: 'three', language: 'english' }],
      respond: jest.fn(async ({ text }) => ({ ok: true, reply: 'ok.', to: 'en', sticky: text === 'one' ? 'af' : text === 'two' ? 'auto' : undefined })),
    });
    await h.session.start();
    for (let i = 0; i < 3; i++) { await speakThenPause(h); await h.flush(3000); }
    expect(h.respond.mock.calls.map((c) => c[0].sticky)).toEqual([null, 'af', null]);
  });

  it("uses the AI's reading of the spoken language over the recogniser's guess", async () => {
    const h = setup({
      transcripts: [{ ok: true, text: 'Hoeveel Coke het ek?', language: 'english' }],
      respond: async () => ({ ok: true, reply: 'Vier.', to: 'af', from: 'af' }),
    });
    await h.session.start();
    await speakThenPause(h);
    const lastUser = [...h.log.captions].reverse().find((c) => c.role === 'user');
    expect(lastUser.lang).toBe('af');
    expect(h.log.turns[0].user.lang).toBe('af');
  });

  it('reports what the assistant did so the screens can refresh and the person can see it', async () => {
    const actions = [{ tool: 'add_product', ok: true, write: true, summary: 'Added new product Snacks: 200 in stock.' }];
    const h = setup({ respond: async () => ({ ok: true, reply: "I've added Snacks.", to: 'en', actions, changed: ['products'] }) });
    await h.session.start();
    await speakThenPause(h);
    expect(h.log.actions).toEqual([{ actions, changed: ['products'] }]);
    const aiCaption = h.log.captions.find((c) => c.role === 'assistant' && c.final);
    expect(aiCaption.actions).toEqual(actions);
  });
});

describe('interrupting', () => {
  it('stops talking when the person speaks over it, and keeps only what was said', async () => {
    const h = setup({ autoSpeak: false, respond: async () => ({ ok: true, reply: 'First sentence is right here. Second sentence follows it. Third one is last.', to: 'en' }) });
    await h.session.start();
    await speakThenPause(h);
    expect(h.session.state).toBe(STATES.SPEAKING);
    expect(h.log.speaks).toHaveLength(1);

    await h.feed(LOUD - 5, 700); // clearly louder, and long enough
    expect(h.log.stops).toBeGreaterThan(0);
    expect(h.session.state).toBe(STATES.HEARING);
    expect(h.log.captions.some((c) => c.interrupted)).toBe(true);
    const assistant = h.session.history.find((m) => m.role === 'assistant');
    expect(assistant.content).toMatch(/\[the user interrupted here\]/);
    expect(assistant.content).not.toMatch(/Third one/);
  });

  it('does not take brief noise during speech as an interruption', async () => {
    const h = setup({ autoSpeak: false });
    await h.session.start();
    await speakThenPause(h);
    expect(h.session.state).toBe(STATES.SPEAKING);
    await h.feed(LOUD, 250);
    await h.feed(QUIET, 200);
    expect(h.session.state).toBe(STATES.SPEAKING);
  });

  it('speaking while the reply is still being worked out makes it one longer message', async () => {
    let release;
    const h = setup({
      transcripts: [{ ok: true, text: 'What should I restock?', language: 'english' }, { ok: true, text: 'and what about prices?', language: 'english' }],
      respond: jest.fn(({ signal, text }) => new Promise((resolve) => { release = () => resolve({ ok: true, reply: `Done: ${text}`, to: 'en' }); signal.addEventListener('abort', () => resolve({ ok: false, error: null })); })),
    });
    await h.session.start();
    await speakThenPause(h);
    expect(h.session.state).toBe(STATES.THINKING);

    await h.feed(LOUD, 1400);
    expect(h.session.state).toBe(STATES.HEARING);
    await h.feed(QUIET, 1300);
    await h.flush();
    expect(h.respond).toHaveBeenCalledTimes(2);
    expect(h.respond.mock.calls[1][0].text).toBe('What should I restock? and what about prices?');
    release();
    await h.flush();
    expect(h.log.turns).toHaveLength(1); // the cancelled first answer was never used
    expect(h.log.turns[0].assistant.text).toMatch(/restock\? and what about prices/);
  });

  it('manual interrupt stops the voice', async () => {
    const h = setup({ autoSpeak: false });
    await h.session.start();
    await speakThenPause(h);
    h.session.interrupt();
    expect(h.session.state).toBe(STATES.LISTENING);
    expect(h.log.stops).toBeGreaterThan(0);
  });

  it('can be turned off so the assistant is never cut off', async () => {
    const h = setup({ autoSpeak: false, settings: { interrupt: false } });
    await h.session.start();
    await speakThenPause(h);
    await h.feed(LOUD, 1500);
    expect(h.session.state).toBe(STATES.SPEAKING);
  });
});

describe('conversation, translation and languages', () => {
  // Conversation is English only now, so language detection matters in the interpreter.
  it('passes the detected language, settings and history to the reply', async () => {
    const h = setup({ transcripts: [{ ok: true, text: 'Hoe gaan dit met my besigheid?', language: 'afrikaans' }], settings: { mode: 'interpreter', targetLang: 'en', homeLang: 'zu' } });
    await h.session.start();
    await speakThenPause(h);
    const arg = h.respond.mock.calls[0][0];
    expect(arg.lang).toBe('af');
    expect(arg.settings.targetLang).toBe('en');
  });

  it('keeps context across turns in conversation mode', async () => {
    const h = setup({ transcripts: [{ ok: true, text: 'How are sales?', language: 'english' }, { ok: true, text: 'And expenses?', language: 'english' }] });
    await h.session.start();
    await speakThenPause(h);
    await h.flush(3000);
    await speakThenPause(h);
    await h.flush(3000);
    const second = h.respond.mock.calls[1][0];
    expect(second.history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(second.history[0].content).toBe('How are sales?');
  });

  it('interpreter mode does not build chat history', async () => {
    const h = setup({ settings: { mode: 'interpreter', targetLang: 'af' }, respond: async () => ({ ok: true, reply: 'Hoe gaan dit?', to: 'af', from: 'en' }) });
    await h.session.start();
    await speakThenPause(h);
    expect(h.session.history).toHaveLength(0);
    expect(h.log.captions.find((c) => c.role === 'assistant')).toMatchObject({ lang: 'af', mode: 'interpreter' });
  });

  it('tells the person once when the device has no voice for the language', async () => {
    const h = setup({ respond: async () => ({ ok: true, reply: 'Sawubona.', to: 'zu' }) });
    h.speaker.speak = jest.fn(async () => ({ spoken: false, reason: 'no-voice' }));
    await h.session.start();
    await speakThenPause(h);
    expect(h.log.notices).toHaveLength(1);
    expect(h.log.notices[0]).toMatch(/isiZulu/);
    expect(h.session.state).toBe(STATES.LISTENING);
  });

  it('keeps the language of the longer snippet when two parts disagree', async () => {
    const h = setup({ transcripts: [{ ok: true, text: 'Ek wil weet van my voorraad en', language: 'afrikaans' }, { ok: true, text: 'ok', language: 'english' }], settings: { mode: 'interpreter', targetLang: 'zu' } });
    await h.session.start();
    await speakThenPause(h);
    await h.feed(LOUD, 600);
    await h.feed(QUIET, 1300);
    await h.flush();
    expect(h.respond.mock.calls[0][0].lang).toBe('af');
  });
});

describe('robustness', () => {
  it('survives a failed transcription and keeps listening', async () => {
    const h = setup({ transcripts: [{ ok: false, error: 'offline' }] });
    await h.session.start();
    await speakThenPause(h);
    expect(h.log.errors[0]).toBe('offline');
    expect(h.session.state).toBe(STATES.LISTENING);
    expect(h.respond).not.toHaveBeenCalled();
  });

  it('survives a failed reply', async () => {
    const h = setup({ respond: async () => ({ ok: false, error: 'busy' }) });
    await h.session.start();
    await speakThenPause(h);
    expect(h.log.errors).toContain('busy');
    expect(h.session.state).toBe(STATES.LISTENING);
  });

  it('ignores silence/hallucination (empty transcript)', async () => {
    const h = setup({ transcripts: [{ ok: true, text: '', language: 'english' }] });
    await h.session.start();
    await speakThenPause(h);
    expect(h.respond).not.toHaveBeenCalled();
    expect(h.session.state).toBe(STATES.LISTENING);
  });

  it('reports a denied microphone', async () => {
    const h = setup();
    h.listener.start = jest.fn(async () => { const e = new Error('Microphone blocked'); e.code = 'permission'; throw e; });
    const r = await h.session.start();
    expect(r).toMatchObject({ ok: false, denied: true });
    expect(h.session.state).toBe(STATES.ERROR);
  });

  it('start a fresh recording when nothing is said for a while', async () => {
    const h = setup();
    await h.session.start();
    await h.feed(QUIET, 7000);
    expect(h.log.discards).toBeGreaterThan(0);
  });

  it('muting pauses listening and unmuting resumes it', async () => {
    const h = setup();
    await h.session.start();
    h.session.setMuted(true);
    expect(h.session.state).toBe(STATES.PAUSED);
    await h.feed(LOUD, 2000);
    await h.feed(QUIET, 2000);
    expect(h.transcribe).not.toHaveBeenCalled();
    h.session.setMuted(false);
    expect(h.session.state).toBe(STATES.LISTENING);
  });

  it('stop closes everything', async () => {
    const h = setup();
    await h.session.start();
    await h.session.stop();
    expect(h.listener.stop).toHaveBeenCalled();
    expect(h.session.state).toBe(STATES.IDLE);
  });
});
