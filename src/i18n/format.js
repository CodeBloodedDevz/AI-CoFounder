// Locale-aware display formatting. These only change how a value is SHOWN. The value itself
// (amounts, dates, quantities stored in the database) is never altered.
import { languageInfo } from './languages';

const cache = new Map();
function formatter(kind, locale, options) {
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  if (cache.has(key)) return cache.get(key);
  let f = null;
  const make = (loc) => (kind === 'number' ? new Intl.NumberFormat(loc, options) : new Intl.DateTimeFormat(loc, options));
  try {
    f = make(locale);
  } catch (e) {
    try { f = make('en-ZA'); } catch (e2) { f = null; }
  }
  cache.set(key, f);
  return f;
}

export function formatNumber(value, language, options = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const f = formatter('number', languageInfo(language).locale, options);
  return f ? f.format(n) : String(n);
}

/** Amount with the business's own currency symbol (default rand). decimals: 0 for whole amounts, 2 for cents. */
export function formatMoney(value, language, { symbol = 'R', decimals = 2 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const body = formatNumber(Math.abs(n), language, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n < 0 ? '-' : ''}${symbol}${body}`;
}

/** "South African Rand (R)" -> "R"; "Euro (€)" -> "€". */
export function currencySymbol(currencyLabel) {
  const m = String(currencyLabel || '').match(/\(([^)]{1,4})\)\s*$/);
  return m ? m[1] : 'R';
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
/** "2026-03-05" -> "5 Mar 2026" in the person's language. Anything that isn't a date is returned as it was. */
export function formatDate(value, language, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return '';
  const m = String(value).match(ISO_DATE);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const f = formatter('date', languageInfo(language).locale, options);
  return f ? f.format(d) : String(value);
}

/** Full timestamp, e.g. "5 Mar, 14:30". */
export function formatDateTime(value, language, options = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  const f = formatter('date', languageInfo(language).locale, options);
  return f ? f.format(d) : String(value);
}

/** "14:30" stays a 24-hour clock time; only the digits' style follows the locale. */
export function formatTime(value) {
  return value ? String(value) : '';
}
