import en from './locales/en';
import zu from './locales/zu';
import af from './locales/af';
import { createTranslate, coverage } from './translate';
import { SUPPORTED_LANGUAGES, resolveLanguage, DEFAULT_LANGUAGE } from './languages';

// One resource file per supported language (see languages.js): English, Afrikaans, isiZulu.
export const TRANSLATIONS = { English: en, Afrikaans: af, isiZulu: zu };

const warned = new Set();
const onMissing = (key) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !warned.has(key)) {
    warned.add(key);
    console.warn(`[i18n] missing translation key: ${key}`);
  }
};

const translators = {};
export function translatorFor(language) {
  const name = resolveLanguage(language) || DEFAULT_LANGUAGE;
  if (!translators[name]) translators[name] = createTranslate({ dict: TRANSLATIONS[name], fallback: en, onMissing });
  return translators[name];
}

/** { name, code, locale, percent, complete } for every language. A language is only offered as "complete"
 *  when every key has a translation of its own. */
let statuses = null;
export function languageStatuses() {
  if (!statuses) statuses = SUPPORTED_LANGUAGES.map((l) => ({ ...l, ...coverage(TRANSLATIONS[l.name], en) }));
  return statuses;
}
export const isLanguageComplete = (name) => languageStatuses().find((l) => l.name === resolveLanguage(name))?.complete ?? false;
