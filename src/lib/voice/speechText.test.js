import { estimateSpeechMs, speechText, splitSentences } from './speechText';
import { languageName, normalizeLangCode, canRecognise } from './languages';
import { sanitizeSettings } from './settings';

describe('speechText', () => {
  it('removes markdown, links and emoji, and reads rand amounts naturally', () => {
    expect(speechText('**Your profit** is R1 250,50 today 🎉 see https://x.co')).toBe('Your profit is 1250,50 rand today see');
    expect(speechText('Margin is 15% on R50.')).toBe('Margin is 15 percent on 50 rand.');
    expect(speechText('- one\n- two')).toBe('one. two');
  });
});

describe('splitSentences', () => {
  it('splits into sentences and joins very short ones to the next', () => {
    expect(splitSentences('Sure. Your sales are up by about ten percent this week. Keep it going!')).toEqual([
      'Sure. Your sales are up by about ten percent this week.',
      'Keep it going!',
    ]);
  });
  it('does not split on decimals or abbreviations', () => {
    expect(splitSentences('The price is 12.50 per unit and Dr. Mokoena agrees with that plan.')).toHaveLength(1);
  });
  it('breaks very long sentences at commas', () => {
    const long = Array.from({ length: 30 }, (_, i) => `item number ${i}`).join(', ') + '.';
    expect(splitSentences(long, { maxLength: 100 }).every((s) => s.length <= 130)).toBe(true);
  });
  it('handles empty input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
  });
  it('estimates how long speaking takes', () => {
    expect(estimateSpeechMs('hello there')).toBeGreaterThan(1500);
  });
});

describe('languages', () => {
  it('understands Whisper names, codes and locales', () => {
    expect(normalizeLangCode('afrikaans')).toBe('af');
    expect(normalizeLangCode('English')).toBe('en');
    expect(normalizeLangCode('en-ZA')).toBe('en');
    expect(normalizeLangCode('zu_ZA')).toBe('zu');
    expect(normalizeLangCode('auto')).toBeNull();
    expect(normalizeLangCode('')).toBeNull();
    expect(normalizeLangCode(null)).toBeNull();
    expect(languageName('xh')).toBe('isiXhosa');
    expect(languageName('???')).toBe('Unknown');
  });
  it('knows which languages can be recognised', () => {
    expect(canRecognise('af')).toBe(true);
    expect(canRecognise('zu')).toBe(false);
  });
});

describe('sanitizeSettings', () => {
  it('fills in defaults and keeps values in range', () => {
    expect(sanitizeSettings(undefined)).toMatchObject({ mode: 'conversation', pauseMs: 1100, sensitivity: 'normal', interrupt: true, speak: true });
    expect(sanitizeSettings({ pauseMs: 99999, mode: 'weird', sensitivity: 'x', speed: 9, homeLang: 'auto' })).toMatchObject({
      pauseMs: 3000, mode: 'conversation', sensitivity: 'normal', speed: 1.4, homeLang: 'en',
    });
    expect(sanitizeSettings({ mode: 'interpreter', interrupt: false }).interrupt).toBe(false);
  });
  it('conversation is English only, whatever was saved before', () => {
    expect(sanitizeSettings({ mode: 'conversation', targetLang: 'af', inputLang: 'zu' })).toMatchObject({ targetLang: 'en', inputLang: 'en', homeLang: 'en' });
  });
  it('the interpreter only uses English, isiZulu and Afrikaans, and never the same language both ways', () => {
    expect(sanitizeSettings({ mode: 'interpreter', targetLang: 'fr', homeLang: 'de' })).toMatchObject({ targetLang: 'zu', homeLang: 'en', inputLang: 'auto' });
    expect(sanitizeSettings({ mode: 'interpreter', targetLang: 'af', homeLang: 'zu' })).toMatchObject({ targetLang: 'af', homeLang: 'zu' });
    expect(sanitizeSettings({ mode: 'interpreter', targetLang: 'en', homeLang: 'en' })).toMatchObject({ targetLang: 'en', homeLang: 'zu' });
  });
});
