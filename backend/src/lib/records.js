// The rules for saving a business profile, services and customers, shared by the app's routes
// (/business, /services, /customers) and the admin portal (/admin-api), so a record changed by an
// administrator follows exactly the same validation as one changed in the app.
// (Moved here unchanged from the route files.)

const supabase = require('../supabaseClient');
const { ok, badRequest, notFound, cleanText, parseNumber } = require('./http');
const { normalizeCurrency } = require('./currency');
const { APP_LANGUAGES, preferredLanguage } = require('./languages');

/* ------------------------------ business ------------------------------ */

const BUSINESS_MODELS = ['Product-based', 'Service-based', 'Hybrid'];

// Shows a currency that an older server version clipped (see lib/currency.js) as its full label.
// A preferred language that is no longer offered (only English, Afrikaans and isiZulu are) reads as
// "not chosen", so the app shows English and the picker's placeholder instead of an invalid choice.
const withCleanCurrency = (row) =>
  row ? { ...row, currency: normalizeCurrency(row.currency), language: row.language ? preferredLanguage(row.language) : row.language ?? null } : null;

// Builds the column values from whatever the form sent (only defined fields).
function businessFields(body) {
  const b = body || {};
  const fields = {};
  const text = [
    ['name', 'name', 120],
    ['type', 'type', 120],
    // Long enough for the full picker labels ("South African Rand (R)" is 22 characters). It used to be
    // 20, which clipped the label to "South African Rand (" and lost the currency symbol.
    ['currency', 'currency', 60],
    ['location', 'location', 200],
    ['hours', 'hours', 200],
    ['goals', 'goals', 1000],
    ['products', 'products_text', 2000],
  ];
  for (const [from, to, max] of text) {
    const v = cleanText(b[from], max);
    if (v !== undefined) fields[to] = from === 'currency' ? normalizeCurrency(v) : v;
  }
  // Preferred language: one of the three the app offers. Aliases ("Zulu", "af") are saved as the
  // picker's name; anything else is refused. Sending '' or null clears it.
  if (b.language !== undefined) {
    const raw = b.language === null ? '' : String(b.language).trim();
    if (!raw) fields.language = null;
    else {
      const lang = preferredLanguage(raw);
      if (!lang) throw badRequest(`Preferred language must be one of: ${APP_LANGUAGES.join(', ')}.`);
      fields.language = lang;
    }
  }
  if (b.businessModel !== undefined && b.businessModel !== null && b.businessModel !== '') {
    if (!BUSINESS_MODELS.includes(b.businessModel)) throw badRequest(`businessModel must be one of: ${BUSINESS_MODELS.join(', ')}.`);
    fields.business_model = b.businessModel;
  }
  return fields;
}

/** Updates an EXISTING business (used by the admin portal; the app's PUT /business also creates). */
async function updateBusiness(business, body) {
  const fields = businessFields(body);
  // A blank name is ignored when the business already has one, so it can never be wiped.
  if (fields.name === '') {
    if (business.name) throw badRequest('Business name cannot be empty.');
    delete fields.name;
  }
  if (!Object.keys(fields).length) return withCleanCurrency(business);
  return withCleanCurrency(ok(await supabase.from('businesses').update(fields).eq('id', business.id).select().single()));
}

/* ------------------------------ services ------------------------------ */

const servicePrice = (v) => {
  const n = parseNumber(v);
  if (n === null || n < 0) throw badRequest('Price must be a number, 0 or more.');
  return n;
};

async function createService(businessId, b = {}) {
  const name = cleanText(b.name, 120);
  if (!name) throw badRequest('Service name is required.');
  const row = {
    business_id: businessId,
    name,
    price: b.price === undefined || b.price === '' || b.price === null ? 0 : servicePrice(b.price),
    duration: cleanText(b.duration, 60) ?? null,
    category: cleanText(b.category, 60) || 'General',
  };
  return ok(await supabase.from('services').insert(row).select().single());
}

// Partial: PricingAssistant sends only { price }.
async function updateService(businessId, id, b = {}) {
  const fields = {};
  if (b.name !== undefined) {
    const name = cleanText(b.name, 120);
    if (!name) throw badRequest('Service name is required.');
    fields.name = name;
  }
  if (b.price !== undefined) fields.price = servicePrice(b.price);
  if (b.duration !== undefined) fields.duration = cleanText(b.duration, 60) || null;
  if (b.category !== undefined) fields.category = cleanText(b.category, 60) || 'General';

  const q = supabase.from('services');
  const data = Object.keys(fields).length
    ? ok(await q.update(fields).eq('id', id).eq('business_id', businessId).select().maybeSingle())
    : ok(await q.select('*').eq('id', id).eq('business_id', businessId).maybeSingle());
  if (!data) throw notFound('Service not found.');
  return data;
}

async function deleteService(businessId, id) {
  ok(await supabase.from('services').delete().eq('id', id).eq('business_id', businessId));
}

/* ------------------------------ customers ----------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Same rule as the app: 10 to 15 digits once spaces, dashes and a leading + / 0 are handled.
function cleanPhone(value) {
  const v = cleanText(value, 40);
  if (!v) return v === undefined ? undefined : null;
  let digits = v.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `27${digits.slice(1)}`;
  else if (digits.length === 9 && /^[678]/.test(digits)) digits = `27${digits}`;
  digits = digits.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw badRequest("That phone number doesn't look right.");
  return v;
}
function cleanEmail(value) {
  const v = cleanText(value, 160);
  if (!v) return v === undefined ? undefined : null;
  if (!EMAIL_RE.test(v)) throw badRequest("That email address doesn't look right.");
  return v.toLowerCase();
}

async function createCustomer(businessId, body = {}) {
  const name = cleanText(body.name, 120);
  if (!name) throw badRequest('Customer name is required.');
  const row = {
    business_id: businessId,
    name,
    phone: cleanPhone(body.phone) ?? null,
    email: cleanEmail(body.email) ?? null,
  };
  return ok(await supabase.from('customers').insert(row).select().single());
}

async function updateCustomer(businessId, id, body = {}) {
  const fields = {};
  if (body.name !== undefined) {
    const name = cleanText(body.name, 120);
    if (!name) throw badRequest('Customer name is required.');
    fields.name = name;
  }
  if (body.phone !== undefined) fields.phone = cleanPhone(body.phone) ?? null;
  if (body.email !== undefined) fields.email = cleanEmail(body.email) ?? null;

  const q = supabase.from('customers');
  const data = Object.keys(fields).length
    ? ok(await q.update(fields).eq('id', id).eq('business_id', businessId).select().maybeSingle())
    : ok(await q.select('*').eq('id', id).eq('business_id', businessId).maybeSingle());
  if (!data) throw notFound('Customer not found.');
  return data;
}

// Also clears the customer off any bookings pointing at them (same as the app's deleteCustomer).
async function deleteCustomer(businessId, id) {
  ok(await supabase.from('upcoming_work').update({ customer_id: null }).eq('customer_id', id).eq('business_id', businessId));
  ok(await supabase.from('customers').delete().eq('id', id).eq('business_id', businessId));
}

/* --------------------------- products / bookings --------------------------- */

async function deleteProduct(businessId, id) {
  ok(await supabase.from('products').delete().eq('id', id).eq('business_id', businessId));
}

async function deleteBooking(businessId, id) {
  ok(await supabase.from('upcoming_work').delete().eq('id', id).eq('business_id', businessId));
}

module.exports = {
  BUSINESS_MODELS,
  withCleanCurrency,
  businessFields,
  updateBusiness,
  createService,
  updateService,
  deleteService,
  cleanPhone,
  cleanEmail,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  deleteProduct,
  deleteBooking,
};
