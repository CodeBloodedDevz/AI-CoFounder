import { formFromBusiness, payloadFromForm, sameForm } from './businessForm';

test('saved details become field values; empty ones stay empty so the placeholder shows', () => {
  const f = formFromBusiness({ name: 'Salon K', type: 'Hair Salon', businessModel: 'Service-based', currency: 'Euro (€)', location: '1 Main Rd', hours: null, goals: undefined, products: '', language: 'Zulu' });
  expect(f).toMatchObject({ name: 'Salon K', type: 'Hair Salon', businessModel: 'Service-based', currency: 'Euro (€)', location: '1 Main Rd', language: 'isiZulu' });
  expect(f.hours).toBe('');
  expect(f.goals).toBe('');
  expect(f.products).toBe('');
});

test('editing never invents a currency; first-time setup suggests one', () => {
  expect(formFromBusiness({ name: 'A' }, true).currency).toBe('');
  expect(formFromBusiness(null, false).currency).toBe('South African Rand (R)');
});

test('payload trims text, allows clearing text boxes, skips empty pickers', () => {
  const p = payloadFromForm({ name: '  My   Shop ', hours: '', type: '', currency: 'Euro (€)', businessModel: 'Hybrid', language: '' });
  expect(p.name).toBe('My Shop');
  expect(p.hours).toBe('');
  expect(p).not.toHaveProperty('type');
  expect(p).not.toHaveProperty('language');
  expect(p.currency).toBe('Euro (€)');
});

test('sameForm compares only form fields', () => {
  expect(sameForm({ name: 'a' }, { name: 'a', hours: '' })).toBe(true);
  expect(sameForm({ name: 'a' }, { name: 'b' })).toBe(false);
});

test('a currency clipped by older servers is shown as the full picker label', () => {
  const { normalizeCurrency } = require('./businessForm');
  expect(normalizeCurrency('South African Rand (')).toBe('South African Rand (R)');
  expect(formFromBusiness({ name: 'X', currency: 'South African Rand (' }, true).currency).toBe('South African Rand (R)');
  expect(normalizeCurrency('Euro (€)')).toBe('Euro (€)');
  expect(normalizeCurrency('')).toBe('');
});

test('only English, Afrikaans and isiZulu can be the preferred language', () => {
  expect(formFromBusiness({ name: 'X', language: 'Afrikaans' }, true).language).toBe('Afrikaans');
  expect(formFromBusiness({ name: 'X', language: 'zu' }, true).language).toBe('isiZulu');
  // A choice older versions offered is shown as "not chosen" (the app then shows English).
  expect(formFromBusiness({ name: 'X', language: 'Sesotho' }, true).language).toBe('');
  expect(formFromBusiness({ name: 'X', language: 'isiXhosa' }, true).language).toBe('');
});
