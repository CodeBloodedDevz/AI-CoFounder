// The translation engine: pure functions, no React, so it is easy to test.
//
//   t('dashboard.recentActivity')                       -> "Recent Activity"
//   t('common.cancel')                                  -> falls back to English when a language lacks the key
//   t('plans.renewsOn', { date: '2026-11-01' })         -> "Renews on 2026-11-01"   ({name} placeholders)
//   t('stock.items', { count: 3 })                      -> uses "stock.items_one" / "stock.items_other" if present
//
// Anything that is a number, a name or a date is passed in as a parameter, never glued into the text,
// so a translation can reorder the sentence freely.

export function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined || params[name] === null ? whole : String(params[name])));
}

export const pluralForm = (count) => (Number(count) === 1 ? 'one' : 'other');

export function createTranslate({ dict, fallback, onMissing }) {
  const find = (key) => (dict && dict[key] !== undefined ? dict[key] : fallback ? fallback[key] : undefined);
  const translate = (key, params) => {
    let text;
    if (params && typeof params.count === 'number') text = find(`${key}_${pluralForm(params.count)}`);
    if (text === undefined) text = find(key);
    if (text === undefined) {
      if (onMissing) onMissing(key);
      return key;
    }
    return interpolate(text, params);
  };
  translate.has = (key) => find(key) !== undefined;
  return translate;
}

/** How much of the English interface a language has translated. */
export function coverage(dict, base) {
  const keys = Object.keys(base).filter((k) => !k.startsWith('_'));
  const done = keys.filter((k) => dict && dict[k] !== undefined && dict[k] !== '').length;
  return { total: keys.length, translated: done, missing: keys.filter((k) => !dict || dict[k] === undefined || dict[k] === ''), percent: keys.length ? Math.round((done / keys.length) * 100) : 100, complete: done === keys.length };
}
