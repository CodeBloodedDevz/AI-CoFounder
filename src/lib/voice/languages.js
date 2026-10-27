// Languages offered in Live Voice.
//
//   stt: true  -> Whisper can recognise (and auto-detect) it when spoken.
//   stt: false -> we can translate / reply IN this language, but speech in it
//                 can't be recognised yet (Whisper has no isiZulu, isiXhosa,
//                 Sesotho or Setswana models).
//   tts: the locales we ask the phone / browser for a voice in, best first.

export const LANGUAGES = [
  { code: 'en', name: 'English', stt: true, tts: ['en-ZA', 'en-GB', 'en-US'] },
  { code: 'af', name: 'Afrikaans', stt: true, tts: ['af-ZA'] },
  { code: 'zu', name: 'isiZulu', stt: false, tts: ['zu-ZA'] },
  { code: 'xh', name: 'isiXhosa', stt: false, tts: ['xh-ZA'] },
  { code: 'st', name: 'Sesotho', stt: false, tts: ['st-ZA'] },
  { code: 'tn', name: 'Setswana', stt: false, tts: ['tn-ZA'] },
  { code: 'sw', name: 'Kiswahili', stt: true, tts: ['sw-KE', 'sw-TZ'] },
  { code: 'sn', name: 'Shona', stt: true, tts: ['sn-ZW'] },
  { code: 'pt', name: 'Portuguese', stt: true, tts: ['pt-PT', 'pt-BR'] },
  { code: 'fr', name: 'French', stt: true, tts: ['fr-FR'] },
  { code: 'es', name: 'Spanish', stt: true, tts: ['es-ES', 'es-US'] },
  { code: 'de', name: 'German', stt: true, tts: ['de-DE'] },
];

// Whisper reports the language it heard as a lowercase English name ("afrikaans").
const WHISPER_NAMES = {
  english: 'en', afrikaans: 'af', zulu: 'zu', xhosa: 'xh', sesotho: 'st', sotho: 'st', tswana: 'tn', setswana: 'tn',
  swahili: 'sw', shona: 'sn', portuguese: 'pt', french: 'fr', spanish: 'es', german: 'de',
  italian: 'it', dutch: 'nl', arabic: 'ar', hindi: 'hi', chinese: 'zh', japanese: 'ja', russian: 'ru',
};

const BY_CODE = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));

/** "English", "english", "en", "en-ZA", "af_ZA" -> "en" | "af" ... ; null when unknown. */
export function normalizeLangCode(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v || v === 'auto') return null;
  if (WHISPER_NAMES[v]) return WHISPER_NAMES[v];
  const base = v.split(/[-_]/)[0];
  if (/^[a-z]{2,3}$/.test(base)) return BY_CODE[base] ? base : WHISPER_NAMES[base] || base;
  return null;
}

export const languageByCode = (code) => BY_CODE[normalizeLangCode(code)] || null;

/** "Afrikaans"; falls back to the upper-cased code for languages we don't list. */
export function languageName(code) {
  const n = normalizeLangCode(code);
  return n ? BY_CODE[n]?.name || n.toUpperCase() : 'Unknown';
}

/** Names for a <Select>, with a mapping back to codes. */
export const nameToCode = (name) => LANGUAGES.find((l) => l.name === name)?.code || null;
export const canRecognise = (code) => Boolean(languageByCode(code)?.stt);
