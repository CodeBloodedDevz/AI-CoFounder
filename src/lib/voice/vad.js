// Voice activity detection: turns a stream of microphone loudness readings
// (in dB, 0 = loudest, around -60 = quiet room) into "speech started" and
// "speech ended" events.
//
// It learns the room's background noise as it goes, so a fan, traffic or a
// noisy market doesn't count as speech, and it needs the silence after speech
// to last `silenceMs` before it calls the statement finished. That pause
// length is the adjustable "silence threshold".

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const DEFAULTS = {
  marginDb: 10, // how far above the background noise counts as speech
  absMinDb: -50, // never treat anything quieter than this as speech
  minSpeechMs: 160, // must stay loud this long to count (ignores clicks and bumps)
  silenceMs: 1100, // quiet this long = the person has finished
  maxUtteranceMs: 45000, // safety: cut off a never-ending recording
  floorInitDb: -60,
  stationaryMs: 1500, // a level that barely changes for this long is background noise, not speech
  stationaryRangeDb: 4,
};

export function createVad(initial = {}) {
  let o = { ...DEFAULTS, ...initial };
  let floor = o.floorInitDb;
  let inSpeech = false;
  let loudMs = 0;
  let quietMs = 0;
  let startedAt = 0;
  let lastT = null;
  let hist = []; // recent readings, to recognise steady noise (a fan, an air-conditioner, a generator)

  const startThreshold = () => Math.max(o.absMinDb, floor + o.marginDb);
  const keepThreshold = () => Math.max(o.absMinDb - 4, floor + o.marginDb * 0.55); // easier to stay "in speech" than to start (hysteresis)

  return {
    /** Feed one reading. Returns a list of events (usually empty). */
    push(db, t) {
      const events = [];
      if (!Number.isFinite(db)) return events;
      const dt = lastT === null ? 0 : clamp(t - lastT, 0, 500);
      lastT = t;

      // Steady noise: speech rises and falls with every syllable, a fan does not.
      hist.push({ db, t });
      while (hist.length && t - hist[0].t > o.stationaryMs) hist.shift();
      if (hist.length > 6 && t - hist[0].t >= o.stationaryMs * 0.9) {
        let lo = Infinity;
        let hi = -Infinity;
        let sum = 0;
        for (const h of hist) {
          lo = Math.min(lo, h.db);
          hi = Math.max(hi, h.db);
          sum += h.db;
        }
        const mean = sum / hist.length;
        if (hi - lo < o.stationaryRangeDb && mean > floor + 3) {
          floor = clamp(mean - 1, -80, -30);
          if (inSpeech) {
            const spanStart = hist[0].t;
            inSpeech = false;
            loudMs = 0;
            quietMs = 0;
            events.push({ type: 'end', t, reason: 'noise', durationMs: Math.max(0, spanStart - startedAt) });
            return events;
          }
          loudMs = 0;
          return events;
        }
      }

      if (!inSpeech) {
        const loud = db > startThreshold();
        if (loud) loudMs += dt;
        else {
          loudMs = Math.max(0, loudMs - dt * 2);
          // Learn the background: drop quickly, rise slowly (so speech can't drag it up).
          floor += (db - floor) * (db < floor ? 0.3 : 0.02);
          floor = clamp(floor, -80, -35);
        }
        if (loudMs >= o.minSpeechMs) {
          inSpeech = true;
          startedAt = t - loudMs;
          quietMs = 0;
          events.push({ type: 'start', t: startedAt });
        }
      } else {
        if (db > keepThreshold()) quietMs = 0;
        else quietMs += dt;

        const total = t - startedAt;
        if (quietMs >= o.silenceMs) {
          inSpeech = false;
          loudMs = 0;
          events.push({ type: 'end', t, reason: 'silence', durationMs: Math.max(0, total - quietMs) });
          quietMs = 0;
        } else if (total >= o.maxUtteranceMs) {
          inSpeech = false;
          loudMs = 0;
          events.push({ type: 'end', t, reason: 'max', durationMs: total });
          quietMs = 0;
        }
      }
      return events;
    },
    setOptions(partial) {
      o = { ...o, ...partial };
    },
    reset({ keepFloor = true } = {}) {
      hist = [];
      inSpeech = false;
      loudMs = 0;
      quietMs = 0;
      lastT = null;
      if (!keepFloor) floor = o.floorInitDb;
    },
    get inSpeech() {
      return inSpeech;
    },
    get floor() {
      return floor;
    },
    get threshold() {
      return startThreshold();
    },
    get quietMs() {
      return quietMs;
    },
  };
}
