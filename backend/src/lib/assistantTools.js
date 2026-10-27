// The things the AI assistant (typed chat AND Live Voice) can actually DO.
//
// Every tool goes through the same business rules as the app's screens
// (lib/bookkeeping.js, the same validators and the same per-business
// scoping), and every write is re-read from the database before it is
// reported as done. A tool never throws: it returns
//   { ok: true,  summary, verified: true, data, changed: ['products'] }
//   { ok: false, error, missing?, candidates? }
// so the model can only honestly say "done" when the database agrees.

const supabase = require('../supabaseClient');
const { HttpError, ok, cleanText, parseNumber, isIsoDate, isUuid } = require('./http');
const { restockProduct, createTransaction, round2 } = require('./bookkeeping');
const { createBooking, updateBooking, normalizeStatus } = require('./bookings');
const { normalizeLang, languageName } = require('./languages');
const rows = require('./rows');

const KINDS = { product: 'products', service: 'services', customer: 'customers', work: 'upcoming_work', transaction: 'transactions' };

const R = (n) => `R${Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2)}`;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const optNum = (v) => (v === undefined || v === null || v === '' ? undefined : parseNumber(v));

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });
const done = (summary, data, changed) => ({ ok: true, verified: true, summary, data, changed });

/** Finds one row by (approximate) name: exact match wins; otherwise a single partial match; otherwise ambiguous / not found. */
function resolveByName(list, name, keys = ['name']) {
  const q = norm(name);
  if (!q) return { error: 'name_missing' };
  const label = (r) => keys.map((k) => r[k]).find(Boolean) || '';
  const exact = list.filter((r) => keys.some((k) => norm(r[k]) === q));
  if (exact.length === 1) return { row: exact[0] };
  if (exact.length > 1) return { error: 'ambiguous', candidates: exact.slice(0, 5).map(label) };
  const partial = list.filter((r) => keys.some((k) => norm(r[k]).includes(q) || (norm(r[k]) && q.includes(norm(r[k])))));
  if (partial.length === 1) return { row: partial[0] };
  if (partial.length > 1) return { error: 'ambiguous', candidates: partial.slice(0, 5).map(label) };
  return { error: 'not_found' };
}

async function all(table, businessId) {
  return ok(await supabase.from(table).select('*').eq('business_id', businessId));
}
async function reread(table, businessId, id) {
  return ok(await supabase.from(table).select('*').eq('id', id).eq('business_id', businessId).maybeSingle());
}

function lookupFailure(kind, name, res) {
  if (res.error === 'ambiguous') {
    return fail(`More than one ${kind} matches "${name}". Ask the user which one they mean.`, { candidates: res.candidates });
  }
  if (res.error === 'name_missing') return fail(`Which ${kind}? The name is missing.`, { missing: ['name'] });
  return fail(`No ${kind} called "${name}" was found.`);
}

/* ------------------------------ tool bodies ------------------------------ */

async function add_product(ctx, a) {
  const name = cleanText(a.name, 120);
  const quantity = parseNumber(a.quantity);
  const missing = [];
  if (!name) missing.push('name');
  if (quantity === null || quantity === undefined || quantity <= 0) missing.push('quantity');
  if (missing.length) return fail('Some details are missing. Ask the user for them.', { missing });

  const unitCost = optNum(a.unit_cost ?? a.bought_price);
  const sellPrice = optNum(a.selling_price);
  if (unitCost !== undefined && (unitCost === null || unitCost < 0)) return fail('The bought price is not a valid number.', { missing: ['unit_cost'] });
  if (sellPrice !== undefined && (sellPrice === null || sellPrice < 0)) return fail('The selling price is not a valid number.', { missing: ['selling_price'] });

  const before = await ctx.findProduct(name);
  if (!before && unitCost === undefined) {
    return fail('This is a new product and the price it was bought at (per unit) is missing. Ask the user for it.', { missing: ['unit_cost'] });
  }

  const { product, created } = await restockProduct(ctx.businessId, {
    name,
    quantity,
    amount: unitCost === undefined ? 0 : round2(unitCost * quantity),
    price: sellPrice,
    category: a.category,
    lowStockThreshold: a.low_stock_threshold,
  });

  // A selling price given for a product that already existed is applied too.
  if (!created && sellPrice !== undefined) {
    ok(await supabase.from('products').update({ price: sellPrice }).eq('id', product.id).eq('business_id', ctx.businessId));
  }

  const stored = await reread('products', ctx.businessId, product.id);
  const expectedStock = created ? quantity : Number(before.stock) + quantity;
  if (!stored || Math.abs(Number(stored.stock) - expectedStock) > 0.0001) {
    return fail('The product was not saved correctly. Tell the user it did not work and to check the Stock screen.');
  }
  const verb = created ? 'Added new product' : 'Added stock to existing product';
  return done(
    `${verb} ${stored.name}: ${Number(stored.stock)} in stock now, bought at ${R(stored.cost)} each, selling at ${R(stored.price)}.`,
    { id: stored.id, name: stored.name, stock: Number(stored.stock), cost: Number(stored.cost), price: Number(stored.price), created, quantityAdded: quantity },
    ['products', 'transactions']
  );
}

async function record_sale(ctx, a) {
  const item = cleanText(a.item, 120);
  const quantity = optNum(a.quantity) ?? 1;
  if (!item) return fail('What was sold? The item is missing.', { missing: ['item'] });
  if (quantity === null || quantity <= 0) return fail('The quantity is not a valid number.', { missing: ['quantity'] });

  let total = optNum(a.total_amount);
  const unit = optNum(a.unit_price);
  const product = await ctx.findProduct(item);
  if (total === undefined && unit !== undefined && unit !== null) total = round2(unit * quantity);
  if (total === undefined && product && Number(product.price) > 0) total = round2(Number(product.price) * quantity);
  if (total === undefined || total === null || total <= 0) return fail('The sale amount is missing. Ask the user how much it was sold for.', { missing: ['amount'] });

  const warning = product && Number(product.stock) < quantity ? `Only ${Number(product.stock)} were in stock.` : undefined;
  const { txn, stock } = await createTransaction(ctx.businessId, { type: 'sale', product: item, quantity, amount: total, date: a.date });
  const stored = await reread('transactions', ctx.businessId, txn.id);
  if (!stored) return fail('The sale was not saved. Tell the user it did not work.');
  return done(
    `Recorded sale of ${quantity} ${stored.product} for ${R(stored.amount)}.${stock && stock.after !== null ? ` ${stock.product} stock is now ${stock.after}.` : ''}${warning ? ` Note: ${warning}` : ''}`,
    { id: stored.id, item: stored.product, quantity: Number(stored.quantity), amount: Number(stored.amount), stockAfter: stock?.after ?? null },
    ['transactions', 'products']
  );
}

async function record_expense(ctx, a) {
  const what = cleanText(a.description, 160);
  const amount = optNum(a.amount);
  const missing = [];
  if (!what) missing.push('description');
  if (amount === undefined || amount === null || amount <= 0) missing.push('amount');
  if (missing.length) return fail('Some details are missing. Ask the user for them.', { missing });
  const { txn } = await createTransaction(ctx.businessId, { type: 'expense', title: what, amount, quantity: optNum(a.quantity), date: a.date });
  const stored = await reread('transactions', ctx.businessId, txn.id);
  if (!stored) return fail('The expense was not saved. Tell the user it did not work.');
  return done(`Recorded expense "${stored.title || stored.product}" of ${R(stored.amount)}.`, { id: stored.id, amount: Number(stored.amount) }, ['transactions']);
}

async function update_product(ctx, a) {
  const found = resolveByName(await all('products', ctx.businessId), a.name);
  if (!found.row) return lookupFailure('product', a.name, found);
  const fields = {};
  const bad = [];
  const num = (key, col, min = 0) => {
    const v = optNum(a[key]);
    if (v === undefined) return;
    if (v === null || v < min) bad.push(key);
    else fields[col] = v;
  };
  num('selling_price', 'price', 0);
  num('unit_cost', 'cost', 0);
  num('set_stock', 'stock', 0);
  num('low_stock_threshold', 'low_stock_threshold', 0);
  if (a.selling_price !== undefined && fields.price === 0) { delete fields.price; bad.push('selling_price'); }
  if (a.new_name) fields.name = cleanText(a.new_name, 120);
  if (a.category) fields.category = cleanText(a.category, 60);
  if (bad.length) return fail(`These values are not valid numbers: ${bad.join(', ')}.`, { missing: bad });
  if (!Object.keys(fields).length) return fail('Nothing to change was given. Ask what should be updated (price, cost, stock, name).', { missing: ['what_to_change'] });

  ok(await supabase.from('products').update(fields).eq('id', found.row.id).eq('business_id', ctx.businessId));
  const stored = await reread('products', ctx.businessId, found.row.id);
  const wrong = Object.entries(fields).find(([k, v]) => (typeof v === 'number' ? Math.abs(Number(stored?.[k]) - v) > 0.0001 : stored?.[k] !== v));
  if (!stored || wrong) return fail('The change was not saved. Tell the user it did not work.');
  return done(
    `Updated ${stored.name}: price ${R(stored.price)}, cost ${R(stored.cost)}, stock ${Number(stored.stock)}.`,
    { id: stored.id, name: stored.name, price: Number(stored.price), cost: Number(stored.cost), stock: Number(stored.stock) },
    ['products']
  );
}

async function add_customer(ctx, a) {
  const name = cleanText(a.name, 120);
  if (!name) return fail('The customer name is missing.', { missing: ['name'] });
  const existing = resolveByName(await all('customers', ctx.businessId), name);
  if (existing.row && norm(existing.row.name) === norm(name)) return fail(`A customer called ${existing.row.name} already exists.`);
  const row = ok(
    await supabase
      .from('customers')
      .insert({ business_id: ctx.businessId, name, phone: cleanText(a.phone, 40) ?? null, email: cleanText(a.email, 160) ?? null })
      .select()
      .single()
  );
  const stored = await reread('customers', ctx.businessId, row.id);
  if (!stored) return fail('The customer was not saved. Tell the user it did not work.');
  return done(`Added customer ${stored.name}${stored.phone ? ` (${stored.phone})` : ''}.`, { id: stored.id, name: stored.name }, ['customers']);
}

async function update_customer(ctx, a) {
  const found = resolveByName(await all('customers', ctx.businessId), a.name);
  if (!found.row) return lookupFailure('customer', a.name, found);
  const fields = {};
  if (a.new_name) fields.name = cleanText(a.new_name, 120);
  if (a.phone !== undefined) fields.phone = cleanText(a.phone, 40) || null;
  if (a.email !== undefined) fields.email = cleanText(a.email, 160) || null;
  if (!Object.keys(fields).length) return fail('Nothing to change was given. Ask what to update (name, phone, email).', { missing: ['what_to_change'] });
  ok(await supabase.from('customers').update(fields).eq('id', found.row.id).eq('business_id', ctx.businessId));
  const stored = await reread('customers', ctx.businessId, found.row.id);
  if (!stored) return fail('The change was not saved.');
  return done(`Updated customer ${stored.name}.`, { id: stored.id, name: stored.name, phone: stored.phone }, ['customers']);
}

async function add_service(ctx, a) {
  const name = cleanText(a.name, 120);
  const price = optNum(a.price);
  const missing = [];
  if (!name) missing.push('name');
  if (price === undefined || price === null || price < 0) missing.push('price');
  if (missing.length) return fail('Some details are missing. Ask the user for them.', { missing });
  const row = ok(
    await supabase
      .from('services')
      .insert({ business_id: ctx.businessId, name, price, duration: cleanText(a.duration, 60) ?? null, category: cleanText(a.category, 60) || 'General' })
      .select()
      .single()
  );
  const stored = await reread('services', ctx.businessId, row.id);
  if (!stored) return fail('The service was not saved.');
  return done(`Added service ${stored.name} at ${R(stored.price)}${stored.duration ? ` (${stored.duration})` : ''}.`, { id: stored.id, name: stored.name, price: Number(stored.price) }, ['services']);
}

async function update_service(ctx, a) {
  const found = resolveByName(await all('services', ctx.businessId), a.name);
  if (!found.row) return lookupFailure('service', a.name, found);
  const fields = {};
  const price = optNum(a.price);
  if (price !== undefined) {
    if (price === null || price < 0) return fail('The price is not a valid number.', { missing: ['price'] });
    fields.price = price;
  }
  if (a.duration !== undefined) fields.duration = cleanText(a.duration, 60) || null;
  if (a.new_name) fields.name = cleanText(a.new_name, 120);
  if (!Object.keys(fields).length) return fail('Nothing to change was given. Ask what to update (price, duration, name).', { missing: ['what_to_change'] });
  ok(await supabase.from('services').update(fields).eq('id', found.row.id).eq('business_id', ctx.businessId));
  const stored = await reread('services', ctx.businessId, found.row.id);
  if (!stored) return fail('The change was not saved.');
  return done(`Updated service ${stored.name}: ${R(stored.price)}.`, { id: stored.id, name: stored.name, price: Number(stored.price) }, ['services']);
}

async function schedule_work(ctx, a) {
  const title = cleanText(a.title, 160);
  const service = cleanText(a.service, 120);
  const missing = [];
  if (!title && !service) missing.push('title');
  if (!a.date) missing.push('date');
  else if (!isIsoDate(a.date)) return fail('The date must be a real calendar date written YYYY-MM-DD. Work it out from today\'s date or ask the user.', { missing: ['date'] });
  if (missing.length) return fail('Some details are missing. Ask the user for them.', { missing });
  const status = a.status ? normalizeStatus(a.status) || 'Pending' : 'Pending';

  let customerId = null;
  let customerName = null;
  if (a.customer_name) {
    const found = resolveByName(await all('customers', ctx.businessId), a.customer_name);
    if (!found.row) {
      return found.error === 'ambiguous'
        ? lookupFailure('customer', a.customer_name, found)
        : fail(`There is no customer called "${a.customer_name}". Ask whether to add them as a new customer first (use add_customer), or schedule without a customer.`);
    }
    customerId = found.row.id;
    customerName = found.row.name;
  }
  // Same rules as the app (date not in the past, no duplicate booking, valid time).
  const row = await createBooking(ctx.businessId, { title: title || service, service, customerId, date: a.date, time: a.time, status });
  const stored = await reread('upcoming_work', ctx.businessId, row.id);
  if (!stored) return fail('The booking was not saved.');
  return done(
    `Scheduled "${stored.title}" on ${stored.date}${stored.time ? ` at ${stored.time}` : ''}${customerName ? ` for ${customerName}` : ''} (${stored.status}).`,
    { id: stored.id, title: stored.title, date: stored.date, time: stored.time },
    ['upcoming_work']
  );
}

async function findWork(ctx, a) {
  if (a.work_id && isUuid(a.work_id)) {
    const r = await reread('upcoming_work', ctx.businessId, a.work_id);
    return r ? { row: r } : { error: 'not_found' };
  }
  let list = await all('upcoming_work', ctx.businessId);
  if (a.date) list = list.filter((w) => w.date === a.date);
  const q = a.title || a.service;
  if (q) return resolveByName(list, q, ['title', 'service']);
  if (list.length === 1) return { row: list[0] };
  return list.length ? { error: 'ambiguous', candidates: list.slice(0, 5).map((w) => `${w.title} ${w.date}`) } : { error: 'not_found' };
}

async function update_work(ctx, a) {
  const found = await findWork(ctx, a);
  if (!found.row) return lookupFailure('booking', a.title || a.service || a.date || '', found);
  const fields = {};
  if (a.new_status) {
    const st = normalizeStatus(a.new_status);
    if (!st) return fail('Status must be one of: Scheduled, Confirmed, Completed, Missed, Cancelled.');
    fields.status = st;
  }
  if (a.new_date) {
    if (!isIsoDate(a.new_date)) return fail('The new date must be written YYYY-MM-DD.');
    fields.date = a.new_date;
  }
  if (a.new_time !== undefined) fields.time = a.new_time || '';
  if (!Object.keys(fields).length) return fail('Nothing to change was given. Ask what to change (status, date, time).', { missing: ['what_to_change'] });
  // Same rules as the app: complete only on/after the day, missed only after the time, reschedule to today or later.
  await updateBooking(ctx.businessId, found.row.id, fields);
  const stored = await reread('upcoming_work', ctx.businessId, found.row.id);
  if (!stored) return fail('The change was not saved.');
  return done(`Updated "${stored.title}": ${stored.date}${stored.time ? ` ${stored.time}` : ''}, ${stored.status}.`, { id: stored.id, status: stored.status, date: stored.date }, ['upcoming_work']);
}

async function find_records(ctx, a) {
  const kind = String(a.kind || '').replace(/s$/, '').replace(/^booking$/, 'work');
  const table = KINDS[kind];
  if (!table) return fail(`kind must be one of: ${Object.keys(KINDS).join(', ')}.`);
  const mapper = { product: rows.toProduct, service: rows.toService, customer: rows.toCustomer, work: rows.toWork, transaction: rows.toTransaction }[kind];
  let list = (await all(table, ctx.businessId)).map(mapper);
  const q = norm(a.query);
  if (q) list = list.filter((r) => norm([r.name, r.title, r.product, r.service, r.phone, r.email].filter(Boolean).join(' ')).includes(q));
  if (kind === 'work' && a.date) list = list.filter((r) => r.date === a.date);
  if (kind === 'transaction' && a.type) list = list.filter((r) => r.type === a.type);
  if (kind === 'transaction' || kind === 'work') list.sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const limit = Math.min(Math.max(Number(a.limit) || 10, 1), 15);
  return { ok: true, count: list.length, records: list.slice(0, limit) };
}

async function delete_record(ctx, a) {
  const kind = String(a.kind || '').replace(/^booking$/, 'work');
  const table = KINDS[kind];
  if (!table || kind === 'transaction') return fail('kind must be product, service, customer or work.');
  let found;
  if (kind === 'work') found = await findWork(ctx, a);
  else found = resolveByName(await all(table, ctx.businessId), a.name);
  if (!found.row) return lookupFailure(kind, a.name || a.title || '', found);
  const label = found.row.name || found.row.title;

  // Deleting needs a second, separate request: the user must say yes AFTER being asked.
  const key = `${ctx.businessId}|${table}|${found.row.id}`;
  const pending = ctx.pending.get(key);
  if (!pending || pending.requestId === ctx.requestId || Date.now() - pending.at > 120_000) {
    ctx.pending.set(key, { requestId: ctx.requestId, at: Date.now() });
    return { ok: false, needs_confirmation: true, error: `Deleting ${kind} "${label}" cannot be undone. Ask the user to confirm, and only call delete_record again after they say yes in their next message.` };
  }
  ctx.pending.delete(key);
  if (kind === 'customer') ok(await supabase.from('upcoming_work').update({ customer_id: null }).eq('customer_id', found.row.id).eq('business_id', ctx.businessId));
  ok(await supabase.from(table).delete().eq('id', found.row.id).eq('business_id', ctx.businessId));
  if (await reread(table, ctx.businessId, found.row.id)) return fail('It could not be deleted. Tell the user it did not work.');
  return done(`Deleted ${kind} "${label}".`, { name: label }, [table]);
}

async function set_language(ctx, a) {
  const raw = String(a.language || '').trim().toLowerCase();
  if (raw === 'auto' || raw === 'same' || raw === 'match') return { ok: true, language: null, summary: 'Replies will follow the language the user speaks.' };
  const code = normalizeLang(raw);
  if (!code) return fail('That language is not recognised.');
  return { ok: true, language: code, summary: `From now on replies are in ${languageName(code)}.` };
}

/* ------------------------------ tool schemas ------------------------------ */

const T = (name, description, properties, required = []) => ({
  type: 'function',
  // `required` is left out when empty: some providers reject an empty list.
  function: { name, description, parameters: { type: 'object', properties, ...(required.length ? { required } : {}) } },
});
const str = (description) => ({ type: 'string', description });
const numP = (description) => ({ type: 'number', description });

const TOOLS = [
  T('add_product', 'Add a new product to stock, or add units to an existing product. Use for "add a product", "I bought/received N of X", "restock". unit_cost is the price paid PER UNIT.', {
    name: str('Product name exactly as the user said it'),
    quantity: numP('How many units are being added'),
    unit_cost: numP('Price paid per unit (the bought price)'),
    selling_price: numP('Optional price the user sells one unit for'),
    category: str('Optional category'),
    low_stock_threshold: numP('Optional low-stock warning level'),
  }, ['name', 'quantity']),
  T('record_sale', 'Record a sale. Reduces stock of a matching product.', {
    item: str('Product or service sold'),
    quantity: numP('Units sold (default 1)'),
    total_amount: numP('Total money received for the whole sale, in rand'),
    unit_price: numP('Price per unit in rand (use instead of total_amount)'),
    date: str('YYYY-MM-DD, only if not today'),
  }, ['item']),
  T('record_expense', 'Record money the business spent (rent, transport, airtime, electricity...). For buying stock use add_product instead.', {
    description: str('What the money was spent on'),
    amount: numP('Amount in rand'),
    date: str('YYYY-MM-DD, only if not today'),
  }, ['description', 'amount']),
  T('update_product', 'Change an existing product: selling price, bought cost, stock count (set exactly), low-stock level, name or category.', {
    name: str('Current product name'),
    selling_price: numP('New selling price'),
    unit_cost: numP('New bought price per unit'),
    set_stock: numP('Set the stock count to exactly this number'),
    low_stock_threshold: numP('New low-stock level'),
    new_name: str('New name'),
    category: str('New category'),
  }, ['name']),
  T('add_customer', 'Save a new customer.', { name: str('Customer name'), phone: str('Phone number'), email: str('Email') }, ['name']),
  T('update_customer', 'Change a customer\'s details.', { name: str('Current name'), new_name: str('New name'), phone: str('New phone'), email: str('New email') }, ['name']),
  T('add_service', 'Add a service the business offers.', { name: str('Service name'), price: numP('Price in rand'), duration: str('e.g. "30 min"'), category: str('Optional category') }, ['name', 'price']),
  T('update_service', 'Change a service (price, duration, name).', { name: str('Current service name'), price: numP('New price'), duration: str('New duration'), new_name: str('New name') }, ['name']),
  T('schedule_work', 'Add an appointment / booking / job to upcoming work.', {
    title: str('What the booking is (e.g. "Haircut - Thandi")'),
    service: str('Service name, if any'),
    date: str('YYYY-MM-DD (work out relative dates like "tomorrow" from today\'s date)'),
    time: str('e.g. "14:30"'),
    customer_name: str('Existing customer this is for'),
    status: { type: 'string', enum: ['Pending', 'Confirmed', 'Completed'] },
  }, ['date']),
  T('update_work', 'Change a booking: mark it Completed, Missed (No-show, only after its time has passed) or Cancelled, or move it to another date/time (reschedule).', {
    work_id: str('Booking id from find_records, if known'),
    title: str('Booking title to look for'),
    date: str('Current date of the booking, to narrow the search'),
    new_status: { type: 'string', enum: ['Pending', 'Confirmed', 'Completed', 'No-show', 'Cancelled'] },
    new_date: str('YYYY-MM-DD'),
    new_time: str('New time'),
  }),
  T('find_records', 'Look up records. Use when the answer is not in the BUSINESS DATA summary (older transactions, a specific customer, a date).', {
    kind: { type: 'string', enum: ['product', 'service', 'customer', 'work', 'transaction'] },
    query: str('Text to match in names'),
    date: str('YYYY-MM-DD (bookings)'),
    type: { type: 'string', enum: ['sale', 'expense'] },
    limit: numP('Max rows (default 10)'),
  }, ['kind']),
  T('delete_record', 'Delete a product, service, customer or booking. ALWAYS ask the user to confirm first; the first call only asks for confirmation, call again after they say yes.', {
    kind: { type: 'string', enum: ['product', 'service', 'customer', 'work'] },
    name: str('Name of the record'),
    title: str('Booking title (kind=work)'),
    date: str('Booking date (kind=work)'),
    work_id: str('Booking id'),
  }, ['kind']),
  T('set_language', 'Use when the user asks you to speak / reply in a particular language from now on ("speak Afrikaans", "praat Engels"), or to go back to matching their language (language="auto").', {
    language: str('Language name or code, or "auto"'),
  }, ['language']),
];

const HANDLERS = {
  add_product, record_sale, record_expense, update_product, add_customer, update_customer,
  add_service, update_service, schedule_work, update_work, find_records, delete_record, set_language,
};
const WRITE_TOOLS = new Set(['add_product', 'record_sale', 'record_expense', 'update_product', 'add_customer', 'update_customer', 'add_service', 'update_service', 'schedule_work', 'update_work', 'delete_record']);

/** Runs one tool call. Never throws. */
async function runTool(name, args, ctx) {
  const handler = HANDLERS[name];
  if (!handler) return fail(`There is no tool called ${name}.`);
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  try {
    return await handler(ctx, a);
  } catch (err) {
    if (err instanceof HttpError && err.status < 500) return fail(err.message);
    console.error(`[assistant:${name}]`, err.message);
    return fail('Something went wrong saving that. Tell the user it did not work and to try again.');
  }
}

module.exports = { TOOLS, WRITE_TOOLS, runTool, resolveByName, norm };
