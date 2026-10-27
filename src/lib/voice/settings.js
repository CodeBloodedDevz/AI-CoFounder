import { clampPause } from './endpointing';

export const DEFAULT_VOICE_SETTINGS = {
  mode: 'conversation', // 'conversation' = talk with the AI | 'interpreter' = live translation
  targetLang: 'en', // conversation: always English | interpreter: "translate to" (English, isiZulu, Afrikaans)
  homeLang: 'en', // interpreter: where to translate back to when the other person speaks the target language
  inputLang: 'en', // conversation: English | interpreter: detected automatically
  pauseMs: 1100, // silence that ends a statement (adjustable)
  sensitivity: 'normal', // microphone sensitivity: 'low' | 'normal' | 'high'
  interrupt: true, // speaking over the assistant stops it
  speak: true, // read replies aloud
  speed: 1, // voice speed
};

// Where the voice settings are kept on the device (shared by Live Voice, the chat microphone and Voice Notes).
export const VOICE_SETTINGS_KEY = 'ai-cofounder-voice-settings-v1';

export const SENSITIVITY_MARGIN_DB = { low: 14, normal: 10, high: 7 };

// Live Voice conversations are in English only. The interpreter translates between these three.
export const INTERPRETER_LANGS = ['en', 'zu', 'af'];

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_VOICE_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  const mode = s.mode === 'interpreter' ? 'interpreter' : 'conversation';
  const pick = (v, fallback) => (INTERPRETER_LANGS.includes(v) ? v : fallback);
  let targetLang = 'en';
  let homeLang = 'en';
  if (mode === 'interpreter') {
    targetLang = pick(s.targetLang, 'zu');
    homeLang = pick(s.homeLang, 'en');
    if (homeLang === targetLang) homeLang = targetLang === 'en' ? 'zu' : 'en';
  }
  return {
    mode,
    // Conversation: English in, English out. Interpreter: the language heard is detected, then translated.
    targetLang,
    homeLang,
    inputLang: mode === 'conversation' ? 'en' : 'auto',
    pauseMs: clampPause(Number.isFinite(Number(s.pauseMs)) ? Number(s.pauseMs) : DEFAULT_VOICE_SETTINGS.pauseMs),
    sensitivity: ['low', 'normal', 'high'].includes(s.sensitivity) ? s.sensitivity : 'normal',
    interrupt: s.interrupt !== false,
    speak: s.speak !== false,
    speed: Math.min(1.4, Math.max(0.7, Number(s.speed) || 1)),
  };
}
