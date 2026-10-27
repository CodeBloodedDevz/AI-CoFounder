// The currency is stored as the label the app's picker shows, e.g. "South African Rand (R)".
// Older versions of the server clipped that text to 20 characters, which turned the default
// into "South African Rand (" (no symbol). This puts such values back to the full label.

const CURRENCIES = ['South African Rand (R)', 'US Dollar ($)', 'Euro (€)', 'British Pound (£)'];

function normalizeCurrency(value) {
  if (typeof value !== 'string') return value ?? null;
  const v = value.trim();
  if (!v) return v;
  if (CURRENCIES.includes(v)) return v;
  const lower = v.toLowerCase();
  // A clipped label is a prefix of exactly one known label.
  const hit = CURRENCIES.find((c) => c.toLowerCase().startsWith(lower) && lower.length >= 4);
  return hit || v;
}

module.exports = { CURRENCIES, normalizeCurrency };
