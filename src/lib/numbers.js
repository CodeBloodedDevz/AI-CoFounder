// Reads numbers the way people type them in South Africa: "50", "50.5", "50,5", "R 1 250,50", "1,250.00".
// Mirrors parseNumber() in backend/src/lib/http.js so the app can check a value before sending it.
// Returns a finite number, or null when the text isn't a number.
export function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.replace(/[\s\u00a0]/g, '').replace(/^[^\d.,-]+/, '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma !== -1) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A positive amount (> 0), or null. */
export const positiveAmount = (value) => {
  const n = parseAmount(value);
  return n !== null && n > 0 ? n : null;
};

/** An amount of 0 or more, or null. */
export const nonNegativeAmount = (value) => {
  const n = parseAmount(value);
  return n !== null && n >= 0 ? n : null;
};

/** Simple email shape check (same rule the server uses). */
export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());

/** Short amount for the graph's scale: R950, R1.3k, R12k, R1.5M. */
export function compactMoney(value, symbol = 'R') {
  const n = Number(value) || 0;
  const a = Math.round(Math.abs(n)); // whole rands first, so 999.6 reads R1k, not R1000
  const short = (x, unit) => `${(x >= 10 ? Math.round(x) : Math.round(x * 10) / 10).toString()}${unit}`;
  const body = a >= 1e6 ? short(a / 1e6, 'M') : a >= 1e3 ? short(a / 1e3, 'k') : String(Math.round(a));
  return `${n < 0 ? '-' : ''}${symbol}${body}`;
}
