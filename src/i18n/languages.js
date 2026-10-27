// The languages the interface can be shown in: English, Afrikaans and isiZulu. These are the only
// options of the "Preferred language" picker (Business Information, Business Profile), the only values
// saved as business.language, and the only values the server accepts for it.
//
// name   : what is stored in the business profile (business.language)
// label  : what the picker shows
// code   : ISO 639-1, also sent to the AI as the interface language
// locale : BCP-47 tag used for number / date formatting
//
// (The language a person SPEAKS to the AI assistant is separate and not limited to these three.)
export const SUPPORTED_LANGUAGES = [
  { name: 'English', label: 'English', code: 'en', locale: 'en-ZA' },
  { name: 'Afrikaans', label: 'Afrikaans', code: 'af', locale: 'af-ZA' },
  { name: 'isiZulu', label: 'isiZulu (Zulu)', code: 'zu', locale: 'zu-ZA' },
];

export const DEFAULT_LANGUAGE = 'English';
export const LANGUAGES = SUPPORTED_LANGUAGES.map((l) => l.name);

const norm = (v) => String(v || '').trim().toLowerCase();

/** "isiZulu" | "Zulu" | "isiZulu (Zulu)" | "zu" | "zu-ZA" -> the stored language name; null for blank or any other language. */
export function resolveLanguage(value) {
  const v = norm(value);
  if (!v) return null;
  const hit = SUPPORTED_LANGUAGES.find(
    (l) => norm(l.name) === v || norm(l.label) === v || l.code === v || norm(l.locale) === v || l.code === v.split(/[-_]/)[0]
  );
  if (hit) return hit.name;
  return { zulu: 'isiZulu' }[v] || null;
}

export const isSupportedLanguage = (value) => resolveLanguage(value) !== null;

/** The label the picker shows for a stored language name ("isiZulu" -> "isiZulu (Zulu)"). */
export const languageDisplayName = (name) => SUPPORTED_LANGUAGES.find((l) => l.name === resolveLanguage(name))?.label || String(name || '');

export const languageInfo = (name) => SUPPORTED_LANGUAGES.find((l) => l.name === resolveLanguage(name)) || SUPPORTED_LANGUAGES[0];
