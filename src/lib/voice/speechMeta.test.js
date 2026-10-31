import { stripSpeechMeta, cleanSpeechText } from './speechMeta';

// Same rules as the server (backend/src/lib/speechMeta.js); the app applies them again before showing text.
test('markers are removed and the spoken languages kept', () => {
  expect(stripSpeechMeta('[en reply=en] You sold R61 today.')).toEqual({ text: 'You sold R61 today.', userLang: 'en', replyLang: 'en' });
  expect(stripSpeechMeta('[user=af reply=af] Jy het R61 verkoop.')).toEqual({ text: 'Jy het R61 verkoop.', userLang: 'af', replyLang: 'af' });
  expect(cleanSpeechText('[user=zu reply=zu] Unezitoko ezingu-20.')).toBe('Unezitoko ezingu-20.');
  expect(cleanSpeechText('[BLANK_AUDIO]')).toBe('');
});
test('real words stay', () => {
  ['I sold (two) loaves.', 'Ngifuna isinkwa (bread).', 'Ek het R50 (vyftig rand) betaal.'].forEach((s) => expect(cleanSpeechText(s)).toBe(s));
});
