// Reads replies aloud with expo-speech (works on iOS, Android and the web).
// speak() resolves when the sentence has finished, or straight away with
// { spoken: false, reason: 'no-voice' } when the device has no voice for the
// language - so the session can show the text instead of going silent.

import * as Speech from 'expo-speech';
import { languageByCode } from './languages';
import { estimateSpeechMs } from './speechText';

const QUALITY_RANK = (v) => {
  const q = String(v.quality || '').toLowerCase();
  const n = String(v.name || '').toLowerCase();
  if (q === 'enhanced' || /natural|neural|premium|enhanced|online/.test(n)) return 2;
  return 1;
};

export function createSpeaker() {
  let voices = null;
  let current = null; // { finish }

  async function loadVoices() {
    if (voices) return voices;
    try {
      voices = (await Speech.getAvailableVoicesAsync()) || [];
    } catch (e) {
      voices = [];
    }
    return voices;
  }

  /** Best voice for a language code: { identifier?, language } or null when none exists. */
  async function pickVoice(code) {
    const list = await loadVoices();
    const lang = languageByCode(code);
    const prefs = (lang?.tts || [code]).map((l) => l.toLowerCase());
    const base = String(code).toLowerCase();
    // Web may report an empty list until voices load; let the platform choose then.
    if (!list.length) return { language: lang?.tts?.[0] || code, unknown: true };
    for (const pref of prefs) {
      const hits = list.filter((v) => String(v.language || '').toLowerCase().replace('_', '-') === pref);
      if (hits.length) return hits.sort((a, b) => QUALITY_RANK(b) - QUALITY_RANK(a))[0];
    }
    const loose = list.filter((v) => String(v.language || '').toLowerCase().replace('_', '-').split('-')[0] === base);
    if (loose.length) return loose.sort((a, b) => QUALITY_RANK(b) - QUALITY_RANK(a))[0];
    return null;
  }

  return {
    async speak(text, code, { rate = 1 } = {}) {
      const voice = await pickVoice(code);
      if (!voice) return { spoken: false, reason: 'no-voice' };
      return new Promise((resolve) => {
        let done = false;
        let watchdog = null;
        const finish = (result) => {
          if (done) return;
          done = true;
          clearTimeout(watchdog);
          if (current && current.finish === finish) current = null;
          resolve(result);
        };
        current = { finish };
        // Some devices never call onDone; don't hang the conversation on them.
        watchdog = setTimeout(() => finish({ spoken: true }), estimateSpeechMs(text, rate) + 4000);
        try {
          Speech.speak(text, {
            language: voice.language,
            voice: voice.identifier,
            rate,
            pitch: 1,
            onDone: () => finish({ spoken: true }),
            onStopped: () => finish({ spoken: true }),
            onError: () => finish({ spoken: false, reason: 'error' }),
          });
        } catch (e) {
          finish({ spoken: false, reason: 'error' });
        }
      });
    },

    async stop() {
      try {
        await Speech.stop();
      } catch (e) {
        /* nothing playing */
      }
      current?.finish({ spoken: true });
    },
  };
}
