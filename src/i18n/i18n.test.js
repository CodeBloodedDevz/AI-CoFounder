// Guards the translation system: run with `npm test`.
import fs from 'fs';
import path from 'path';
import en from './locales/en';
import { TRANSLATIONS, languageStatuses, translatorFor, isLanguageComplete } from './index';
import { createTranslate, interpolate, coverage } from './translate';
import { SUPPORTED_LANGUAGES, LANGUAGES, resolveLanguage, languageDisplayName } from './languages';
import { formatMoney, formatNumber, formatDate, currencySymbol } from './format';

const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

describe('translation engine', () => {
  test('fills {placeholders} and leaves unknown ones visible', () => {
    expect(interpolate('Hi {name}, {n} left', { name: 'Thando', n: 3 })).toBe('Hi Thando, 3 left');
    expect(interpolate('Hi {name}', {})).toBe('Hi {name}');
  });

  test('falls back to English per key, then to the key itself', () => {
    const missing = [];
    const t = createTranslate({ dict: { a: 'A-zu' }, fallback: { a: 'A', b: 'B' }, onMissing: (k) => missing.push(k) });
    expect(t('a')).toBe('A-zu');
    expect(t('b')).toBe('B');
    expect(t('c')).toBe('c');
    expect(missing).toEqual(['c']);
  });

  test('chooses the singular / plural form from params.count', () => {
    const t = createTranslate({ dict: {}, fallback: { x_one: '{count} item', x_other: '{count} items' } });
    expect(t('x', { count: 1 })).toBe('1 item');
    expect(t('x', { count: 4 })).toBe('4 items');
  });
});

describe('resource files', () => {
  test('every supported language has a resource file registered', () => {
    SUPPORTED_LANGUAGES.forEach((l) => expect(TRANSLATIONS[l.name]).toBeDefined());
  });

  test('no language has keys that English does not have (typos)', () => {
    Object.entries(TRANSLATIONS).forEach(([name, dict]) => {
      const stray = Object.keys(dict).filter((k) => !(k in en));
      expect([name, stray]).toEqual([name, []]);
    });
  });

  test('translations keep the same {placeholders} as English', () => {
    Object.entries(TRANSLATIONS).forEach(([name, dict]) => {
      const bad = Object.keys(dict).filter((k) => placeholders(dict[k]) !== placeholders(en[k]));
      expect([name, bad]).toEqual([name, []]);
    });
  });

  test('exactly English, Afrikaans and isiZulu are offered, and every one is complete', () => {
    expect(LANGUAGES).toEqual(['English', 'Afrikaans', 'isiZulu']);
    expect(Object.keys(TRANSLATIONS).sort()).toEqual(['Afrikaans', 'English', 'isiZulu']);
    const status = Object.fromEntries(languageStatuses().map((l) => [l.name, l]));
    LANGUAGES.forEach((n) => expect([n, status[n].complete, status[n].missing]).toEqual([n, true, []]));
    expect(isLanguageComplete('isiZulu')).toBe(true);
    expect(languageDisplayName('isiZulu')).toBe('isiZulu (Zulu)');
    expect(coverage({ a: 'x' }, { a: 'A', b: 'B' }).percent).toBe(50);
  });

  test('switching language changes the text', () => {
    expect(translatorFor('English')('schedule.today')).toBe('Today');
    expect(translatorFor('Afrikaans')('schedule.today')).toBe('Vandag');
    expect(translatorFor('isiZulu')('schedule.today')).toBe('Namuhla');
    // A language that is not offered (any more) shows English, never blank text.
    expect(translatorFor('Sesotho')('schedule.today')).toBe('Today');
  });
});

describe('no hardcoded keys are missing', () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'locales' ? [] : walk(p);
      return e.name.endsWith('.js') && !e.name.endsWith('.test.js') && e.name !== 'translate.js' ? [p] : [];
    });

  test('every t(\'key\') / tr(\'key\') used in the app exists in en.js', () => {
    const root = path.join(__dirname, '..');
    const dynamicPrefixes = ['plans.', 'payment.', 'voice.pause.', 'voice.state.', 'subscription.cycle.', 'workStatus.', 'businessType.', 'businessModel.', 'currency.', 'expenseCategory.', 'ai.'];
    const missing = [];
    walk(root).forEach((file) => {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\b(?:t|tr)\(\s*'([A-Za-z][\w.]*)'/g)) {
        const key = m[1];
        const has = key in en || `${key}_one` in en || `${key}_other` in en;
        if (!has && !dynamicPrefixes.some((p) => key.startsWith(p))) missing.push(`${path.relative(root, file)}: ${key}`);
      }
    });
    expect(missing).toEqual([]);
  });
});

describe('locale-aware display formatting', () => {
  test('numbers and money change how they look, never their value', () => {
    expect(formatNumber(1234.5, 'English', { minimumFractionDigits: 2 })).toMatch(/1\D?234[.,]50/);
    expect(formatMoney(100, 'isiZulu', { decimals: 2 })).toMatch(/^R100[.,]00$/);
    expect(formatMoney(-5, 'English', { decimals: 0 })).toBe('-R5');
    expect(formatMoney(12.5, 'English', { symbol: '€', decimals: 2 })).toMatch(/^€12[.,]50$/);
  });

  test('currency symbol comes from the business currency, not the language', () => {
    expect(currencySymbol('Euro (€)')).toBe('€');
    expect(currencySymbol('South African Rand (R)')).toBe('R');
    expect(currencySymbol(undefined)).toBe('R');
  });

  test('dates are shown in the language; garbage is returned unchanged', () => {
    expect(formatDate('2026-03-05', 'English')).toMatch(/5/);
    expect(formatDate('not a date', 'English')).toBe('not a date');
    expect(formatDate('', 'English')).toBe('');
  });

  test('language names resolve from names, codes and locales', () => {
    expect(resolveLanguage('isiZulu')).toBe('isiZulu');
    expect(resolveLanguage('zu')).toBe('isiZulu');
    expect(resolveLanguage('af-ZA')).toBe('Afrikaans');
    expect(resolveLanguage('Zulu')).toBe('isiZulu');
    expect(resolveLanguage('isiZulu (Zulu)')).toBe('isiZulu');
    expect(resolveLanguage('Klingon')).toBeNull();
    // No longer offered: not accepted as a preferred language.
    ['isiXhosa', 'xh', 'Sesotho', 'st', 'Setswana', 'tn-ZA'].forEach((v) => expect(resolveLanguage(v)).toBeNull());
  });
});
