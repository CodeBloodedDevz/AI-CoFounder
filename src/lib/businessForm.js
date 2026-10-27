// Turns the saved business (state.business, loaded from GET /business) into the Business Information
// form, and the form back into what PUT /business expects.
//
// Saved text is the field's VALUE. A field with nothing saved stays '' so the grey placeholder shows.
import { resolveLanguage } from '../i18n/languages';

export const DEFAULT_CURRENCY = 'South African Rand (R)';
export const DEFAULT_MODEL = 'Product-based';

export const CURRENCIES = ['South African Rand (R)', 'US Dollar ($)', 'Euro (€)', 'British Pound (£)'];

/** Older servers clipped the saved label to 20 characters ("South African Rand ("): show the full label. */
export function normalizeCurrency(value) {
  if (typeof value !== 'string') return value ?? '';
  const v = value.trim();
  if (!v || CURRENCIES.includes(v)) return v;
  const lower = v.toLowerCase();
  return (lower.length >= 4 && CURRENCIES.find((c) => c.toLowerCase().startsWith(lower))) || v;
}

export const FORM_FIELDS = ['name', 'type', 'businessModel', 'currency', 'products', 'location', 'hours', 'goals', 'language'];

const text = (v) => (typeof v === 'string' ? v : '');

// isEdit: a business already exists, so show exactly what is saved (blank stays blank -> placeholder).
// First-time setup gets the sensible starting choices for the two pickers.
export function formFromBusiness(business, isEdit = !!business) {
  const b = business || {};
  return {
    name: text(b.name),
    type: text(b.type),
    businessModel: text(b.businessModel) || DEFAULT_MODEL,
    currency: normalizeCurrency(text(b.currency)) || (isEdit ? '' : DEFAULT_CURRENCY),
    products: text(b.products),
    location: text(b.location),
    hours: text(b.hours),
    goals: text(b.goals),
    // Only English / Afrikaans / isiZulu can be chosen; an older, no-longer-offered choice shows as not chosen.
    language: resolveLanguage(text(b.language)) || '',
  };
}

// Free-text boxes are sent as typed (so a person can clear one). Pickers are only sent when chosen,
// so an untouched picker never overwrites what is saved.
export function payloadFromForm(form) {
  const f = form || {};
  const clean = (v) => text(v).replace(/\s+/g, ' ').trim();
  const payload = {
    name: clean(f.name),
    products: clean(f.products),
    location: clean(f.location),
    hours: clean(f.hours),
    goals: clean(f.goals),
  };
  for (const key of ['type', 'businessModel', 'currency', 'language']) {
    const v = clean(f[key]);
    if (v) payload[key] = v;
  }
  return payload;
}

export function sameForm(a, b) {
  return FORM_FIELDS.every((k) => (a?.[k] || '') === (b?.[k] || ''));
}
