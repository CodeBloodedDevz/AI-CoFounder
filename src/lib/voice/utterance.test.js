import { createUtteranceCapture } from './utterance';
import { createVad } from './vad';

// A pretend microphone: the test feeds loudness readings, like the phone does every 80 ms.
function fakeListener() {
  const l = {
    level: null,
    cuts: 0,
    stopped: 0,
    async start(cb) {
      l.level = cb;
    },
    async cut() {
      l.cuts += 1;
      return { uri: `file://seg-${l.cuts}.m4a`, durationMs: l.clock - l.t0 };
    },
    async stop() {
      l.stopped += 1;
    },
    release() {},
  };
  return l;
}
const STEP = 80;
// Speech rises and falls with every syllable (steady sound is treated as background noise).
const level = (db, i) => (db >= -38 ? db + [0, -9, 3, -12, 2, -6][i % 6] : db + [0, 0.5, -0.5][i % 3]);
async function run({ pattern, vadOptions = {}, noSpeechMs = 8000 }) {
  const listener = fakeListener();
  let clock = 0;
  listener.t0 = 0;
  const states = [];
  const cap = createUtteranceCapture({ listener, makeVad: createVad, vadOptions, noSpeechMs, now: () => clock, onState: (s) => states.push(s) });
  const result = cap.start();
  await Promise.resolve();
  await Promise.resolve();
  let i = 0;
  for (const [db, ms] of pattern) {
    for (let t = 0; t < ms; t += STEP) {
      clock += STEP;
      listener.clock = clock;
      listener.level?.(level(db, i++));
      await Promise.resolve();
    }
  }
  const out = await Promise.race([result, new Promise((r) => setTimeout(() => r('pending'), 20))]);
  return { out, listener, states, cap };
}
const QUIET = -58;
const NOISY = -42; // a noisy room
const SPEECH = -22;
const SOFT = -36; // quiet speech in a quiet room

describe('utterance capture', () => {
  test('sends by itself after the person stops talking (once)', async () => {
    const { out, listener, states } = await run({ pattern: [[QUIET, 600], [SPEECH, 1500], [QUIET, 1400]], vadOptions: { silenceMs: 1100 } });
    expect(out).toMatchObject({ ok: true, reason: 'pause' });
    expect(listener.cuts).toBe(1);
    expect(states).toContain('hearing');
  });
  test('a short pause inside a sentence does not cut it off', async () => {
    const { out } = await run({ pattern: [[QUIET, 500], [SPEECH, 900], [QUIET, 600], [SPEECH, 900]], vadOptions: { silenceMs: 1100 } });
    expect(out).toBe('pending'); // still listening: the 600 ms pause was shorter than the 1.1 s setting
  });
  test('a longer pause setting waits longer', async () => {
    const short = await run({ pattern: [[QUIET, 500], [SPEECH, 900], [QUIET, 1300]], vadOptions: { silenceMs: 1100 } });
    const long = await run({ pattern: [[QUIET, 500], [SPEECH, 900], [QUIET, 1300]], vadOptions: { silenceMs: 2000 } });
    expect(short.out.ok).toBe(true);
    expect(long.out).toBe('pending');
  });
  test('steady background noise is not speech; speech above it is', async () => {
    const noise = await run({ pattern: [[NOISY, 4000]], noSpeechMs: 3000 });
    expect(noise.out).toMatchObject({ empty: true });
    const talk = await run({ pattern: [[NOISY, 600], [SPEECH, 1200], [NOISY, 1500]] });
    expect(talk.out.ok).toBe(true);
  });
  test('quiet speech in a quiet room is still heard', async () => {
    const { out } = await run({ pattern: [[QUIET, 500], [SOFT, 1200], [QUIET, 1500]] });
    expect(out.ok).toBe(true);
  });
  test('nothing said: stops and sends nothing', async () => {
    const { out, listener } = await run({ pattern: [[QUIET, 3500]], noSpeechMs: 3000 });
    expect(out).toEqual({ empty: true });
    expect(listener.cuts).toBe(0);
    expect(listener.stopped).toBe(1);
  });
  test('tap to stop sends what was said; tapping again or the pause later does nothing more', async () => {
    const listener = fakeListener();
    let clock = 0;
    listener.t0 = 0;
    const cap = createUtteranceCapture({ listener, makeVad: createVad, now: () => clock });
    const result = cap.start();
    await Promise.resolve();
    await Promise.resolve();
    for (let i = 0; i < 25; i++) {
      clock += STEP;
      listener.clock = clock;
      listener.level(level(i < 5 ? QUIET : SPEECH, i));
    }
    cap.finish();
    cap.finish();
    const out = await result;
    expect(out).toMatchObject({ ok: true, reason: 'tap' });
    for (let i = 0; i < 30; i++) {
      clock += STEP;
      listener.level?.(QUIET);
    }
    expect(listener.cuts).toBe(1);
  });
  test('cancel throws the recording away', async () => {
    const listener = fakeListener();
    const cap = createUtteranceCapture({ listener, makeVad: createVad, now: () => 0 });
    const result = cap.start();
    await Promise.resolve();
    cap.cancel();
    expect(await result).toEqual({ cancelled: true });
    expect(listener.cuts).toBe(0);
  });
  test('microphone permission refused is reported', async () => {
    const listener = { start: async () => { const e = new Error('no mic'); e.code = 'permission'; e.blocked = true; throw e; } };
    const cap = createUtteranceCapture({ listener, makeVad: createVad });
    expect(await cap.start()).toMatchObject({ ok: false, denied: true, blocked: true });
  });
});
