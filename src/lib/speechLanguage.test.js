// Voice notes take their spoken language from the Business Profile's preferred language.
import { speechLanguageFor } from './voiceNotes';

test('preferred language -> speech-to-text language', () => {
  expect(speechLanguageFor('English')).toBe('en');
  expect(speechLanguageFor('Afrikaans')).toBe('af');
  expect(speechLanguageFor('isiZulu')).toBe('auto'); // no isiZulu speech model: detect English / Afrikaans
  expect(speechLanguageFor(null)).toBe('auto');
});
