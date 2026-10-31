import { createVad } from './vad';

const clocks = new WeakMap();
const run = (vad, readings) => {
  let t = clocks.get(vad) || 0; // time keeps running across calls for the same detector
  const events = [];
  for (const [db, ms] of readings) {
    for (let i = 0; i < ms; i += 50) {
      vad.push(db, t).forEach((e) => events.push({ ...e, at: t }));
      t += 50;
    }
  }
  clocks.set(vad, t);
  return events;
};

describe('createVad', () => {
  it('detects a statement and its end after the silence threshold', () => {
    const vad = createVad({ silenceMs: 1000 });
    const ev = run(vad, [[-65, 500], [-20, 1500], [-65, 1500]]);
    expect(ev.map((e) => e.type)).toEqual(['start', 'end']);
    expect(ev[1].reason).toBe('silence');
    expect(ev[1].durationMs).toBeGreaterThan(1300);
    expect(ev[1].durationMs).toBeLessThan(1700);
  });

  it('does not end on a short pause (thinking)', () => {
    const vad = createVad({ silenceMs: 1100 });
    const ev = run(vad, [[-65, 400], [-20, 1000], [-65, 800], [-20, 1000], [-65, 1400]]);
    expect(ev.map((e) => e.type)).toEqual(['start', 'end']); // one statement, not two
  });

  it('a larger silence threshold waits longer', () => {
    const quick = run(createVad({ silenceMs: 600 }), [[-65, 400], [-20, 1000], [-65, 900]]);
    const patient = run(createVad({ silenceMs: 2000 }), [[-65, 400], [-20, 1000], [-65, 900]]);
    expect(quick.map((e) => e.type)).toEqual(['start', 'end']);
    expect(patient.map((e) => e.type)).toEqual(['start']);
  });

  it('ignores very short bursts', () => {
    expect(run(createVad(), [[-65, 400], [-20, 100], [-65, 2000]])).toEqual([]);
  });

  it('learns steady background noise instead of treating it as speech', () => {
    const vad = createVad();
    const fan = run(vad, [[-42, 6000]]); // a fan: constant -42 dB, louder than the starting guess
    const endedAsNoise = fan.filter((e) => e.type === 'end');
    expect(endedAsNoise.every((e) => e.reason === 'noise' && e.durationMs < 400)).toBe(true);
    expect(vad.inSpeech).toBe(false);
    expect(vad.floor).toBeGreaterThan(-46);

    const later = run(vad, [[-42, 2000], [-22, 1200], [-42, 2500]]);
    expect(later.map((e) => e.type)).toEqual(['start', 'end']);
    expect(later[1].reason).toBe('silence');
  });

  it('keeps speech going through quiet syllables (hysteresis)', () => {
    const vad = createVad({ silenceMs: 1000 });
    const ev = run(vad, [[-65, 400], [-20, 400], [-48, 300], [-20, 400], [-65, 1500]]);
    expect(ev.map((e) => e.type)).toEqual(['start', 'end']);
  });

  it('cuts off a never-ending recording', () => {
    const vad = createVad({ maxUtteranceMs: 3000 });
    const speechLike = Array.from({ length: 50 }, (_, i) => [i % 2 ? -20 : -30, 100]); // rises and falls like syllables
    const ev = run(vad, [[-65, 400], ...speechLike]);
    expect(ev.find((e) => e.type === 'end')).toMatchObject({ reason: 'max' });
  });

  it('ignores invalid readings', () => {
    const vad = createVad();
    expect(vad.push(NaN, 0)).toEqual([]);
    expect(vad.push(undefined, 50)).toEqual([]);
  });
});
