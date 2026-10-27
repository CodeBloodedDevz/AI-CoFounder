// Users & Businesses: the people using the app, their business profile and every record the app keeps
// for them (transactions, stock, services, customers, bookings, payments).
//
// Every change calls the SAME function the app's own routes use (lib/bookkeeping, lib/bookings,
// lib/records, lib/payments), so an admin edit follows exactly the app's rules: a deleted sale puts
// its units back in stock, completing a booking records its income, edits are kept in edit_history,
// and so on. Each change is written to the admin audit log.

const express = require('express');
const supabase = require('../supabaseClient');
const { wrap, ok, notFound, badRequest, HttpError, validateIdParam, pick } = require('../lib/http');
const { clearAuthCache } = require('../middleware/auth');
const { summarise, topSellingProducts, lowStockProducts, outOfStockProducts, stockStatus } = require('../lib/aiEngine');
const { toProduct } = require('../lib/rows');
const { updateTransaction, deleteTransaction, updateProduct } = require('../lib/bookkeeping');
const { updateBooking, OPEN } = require('../lib/bookings');
const records = require('../lib/records');
const { getSubscription, cancelAtPeriodEnd, resumeSubscription, paymentDto } = require('../lib/payments');
const { loadAccounts, findAccount, forgetAccounts, filterAccounts, currencySymbol } = require('./accounts');
const { requireRole } = require('./auth');
const { writeAudit } = require('./audit');
const { saDate, readPaging, pageOf, pageResult, cleanSearch, mapUser, monthStart, todayInSA } = require('./util');

const router = express.Router();
router.param('id', validateIdParam);
router.param('recordId', validateIdParam);

const SUSPEND_FOR = '876000h'; // ~100 years: Supabase's way of saying "until lifted"
const superOnly = requireRole('super_admin');
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const countOf = (result) => {
  ok(result);
  return result.count || 0;
};

// Booking statuses as the app shows them (lib/bookings.js keeps the stored names).
const BOOKING_LABEL = { Pending: 'Scheduled', Confirmed: 'Confirmed', Completed: 'Completed', 'No-show': 'Missed', Cancelled: 'Cancelled' };

/* ----------------------------------- users ----------------------------------- */

const readFilters = (q) => ({
  search: String(q.search || '').trim(),
  plan: ['free', 'pro', 'premium'].includes(String(q.plan)) ? String(q.plan) : null,
  status: ['active', 'suspended'].includes(String(q.status)) ? String(q.status) : null,
});

// GET /admin/users?search=&plan=&status=&page=&limit=
router.get('/users', wrap(async (req, res) => {
  const { page, limit } = readPaging(req.query);
  const list = filterAccounts(await loadAccounts(), readFilters(req.query)).map(mapUser);
  res.json(pageOf('users', list, page, limit));
}));

/** Loads the account (404 if unknown) and its business row (null when it hasn't set one up yet). */
async function loadTarget(req, res, next) {
  try {
    const account = await findAccount(req.params.id);
    if (!account) throw notFound('User not found.');
    const rows = ok(await supabase.from('businesses').select('*').eq('owner_id', account.id).order('created_at', { ascending: true }).limit(1));
    req.target = { account, business: rows[0] || null };
    next();
  } catch (err) {
    next(err);
  }
}
const needBusiness = (req, res, next) => (req.target.business ? next() : next(new HttpError(404, 'This user has not set up a business yet.')));
const bizId = (req) => req.target.business.id;

// GET /admin/users/:id
router.get('/users/:id', loadTarget, (req, res) => {
  res.json({ ...mapUser(req.target.account), subscription: req.target.account.subscription });
});

// PATCH /admin/users/:id/status   { status: 'active' | 'suspended' }
// Suspends with a Supabase Auth ban: the person can't sign in, and the app's backend refuses their
// existing session on the next request (middleware/auth.js). Reactivating lifts the ban.
router.patch('/users/:id/status', loadTarget, wrap(async (req, res) => {
  const status = String(req.body?.status || '').toLowerCase();
  if (!['active', 'suspended'].includes(status)) throw badRequest('status must be "active" or "suspended".');
  const { account } = req.target;
  if (account.isAdmin || account.id === req.admin.id) throw badRequest('Administrator accounts cannot be suspended here.');

  const { error } = await supabase.auth.admin.updateUserById(account.id, { ban_duration: status === 'suspended' ? SUSPEND_FOR : 'none' });
  if (error) {
    console.error('[admin] suspend failed:', error.message);
    throw new HttpError(503, "Couldn't change the account status. Please try again.");
  }
  clearAuthCache();
  forgetAccounts();
  // Their Sponsored adverts disappear while the account is suspended and come back when it is reactivated.
  await require('../lib/sponsored').setAccountSuspended(account.id, status === 'suspended');
  await writeAudit(req.admin, {
    action: status === 'suspended' ? 'user.suspend' : 'user.reactivate',
    level: status === 'suspended' ? 'warning' : 'info',
    targetType: 'user',
    targetId: account.id,
    message: `${req.admin.email} ${status === 'suspended' ? 'suspended' : 'reactivated'} ${account.email}`,
  });
  res.json(mapUser(await findAccount(account.id)));
}));

/* ------------------------------ business overview ------------------------------ */

// GET /admin/users/:id/overview  -> the business profile, plan and figures (same maths as the app)
router.get('/users/:id/overview', loadTarget, wrap(async (req, res) => {
  const { account, business } = req.target;
  const base = { user: mapUser(account), business: null, subscription: account.subscription, stats: null };
  if (!business) return res.json(base);

  const id = business.id;
  const [txns, products, services, customers, work] = await Promise.all([
    supabase.from('transactions').select('type, product, amount, date').eq('business_id', id).then(ok),
    supabase.from('products').select('*').eq('business_id', id).then(ok),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('business_id', id).then(countOf),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', id).then(countOf),
    supabase.from('upcoming_work').select('status, date').eq('business_id', id).then(ok),
  ]);
  const today = todayInSA();
  const month = txns.filter((t) => String(t.date) >= monthStart(today) && String(t.date) <= today);
  const items = products.map(toProduct);
  const clean = records.withCleanCurrency(business);
  const count = (fn) => work.filter(fn).length;

  res.json({
    ...base,
    business: { ...clean, currencySymbol: currencySymbol(clean.currency) },
    subscription: await getSubscription(id),
    stats: {
      month: summarise(month),
      allTime: summarise(txns),
      topProducts: topSellingProducts(month, 5),
      transactions: txns.length,
      products: items.length,
      lowStock: lowStockProducts(items).length,
      outOfStock: outOfStockProducts(items).length,
      stockValue: Math.round(items.reduce((s, p) => s + p.stock * p.cost, 0) * 100) / 100,
      services: services || 0,
      customers: customers || 0,
      bookings: {
        total: work.length,
        upcoming: count((w) => OPEN.includes(w.status) && String(w.date) >= today),
        completed: count((w) => w.status === 'Completed'),
        missed: count((w) => w.status === 'No-show'),
        cancelled: count((w) => w.status === 'Cancelled'),
      },
    },
  });
}));

// PUT /admin/users/:id/business  -> edit the business profile (same rules as the app's PUT /business)
router.put('/users/:id/business', loadTarget, needBusiness, wrap(async (req, res) => {
  const body = pick(req.body, ['name', 'type', 'businessModel', 'currency', 'location', 'hours', 'goals', 'language']);
  const updated = await records.updateBusiness(req.target.business, body);
  forgetAccounts();
  await writeAudit(req.admin, { action: 'business.update', targetType: 'business', targetId: updated.id, message: `${req.admin.email} edited the business profile of ${updated.name}`, details: { fields: Object.keys(body) } });
  res.json({ ...updated, currencySymbol: currencySymbol(updated.currency) });
}));

/* -------------------------------- transactions -------------------------------- */

const mapTxn = (r) => ({
  id: r.id,
  date: r.date,
  type: r.type,
  item: r.product || r.title || '',
  title: r.title || '',
  quantity: n(r.quantity),
  amount: n(r.amount),
  note: r.note || '',
  source: r.source || 'manual',
  fromBooking: Boolean(r.booking_id),
  edits: Array.isArray(r.edit_history) ? r.edit_history.length : 0,
});

// GET /admin/users/:id/transactions?search=&type=&page=&limit=
router.get('/users/:id/transactions', loadTarget, needBusiness, wrap(async (req, res) => {
  const { page, limit, from } = readPaging(req.query, 10);
  let q = supabase.from('transactions').select('*', { count: 'exact' }).eq('business_id', bizId(req));
  if (['sale', 'expense'].includes(req.query.type)) q = q.eq('type', req.query.type);
  const s = cleanSearch(req.query.search);
  if (s) q = q.or(`product.ilike.%${s}%,title.ilike.%${s}%,note.ilike.%${s}%`);
  const result = await q.order('date', { ascending: false }).order('created_at', { ascending: false }).range(from, from + limit - 1);
  res.json(pageResult('transactions', ok(result).map(mapTxn), result.count, page, limit));
}));

router.put('/users/:id/transactions/:recordId', loadTarget, needBusiness, wrap(async (req, res) => {
  const body = pick(req.body, ['amount', 'title', 'product', 'note', 'date', 'quantity']);
  const row = await updateTransaction(bizId(req), req.params.recordId, body);
  await writeAudit(req.admin, { action: 'transaction.update', targetType: 'transaction', targetId: row.id, message: `${req.admin.email} edited a ${row.type} of ${req.target.business.name}`, details: { fields: Object.keys(body) } });
  res.json(mapTxn(row));
}));

router.delete('/users/:id/transactions/:recordId', superOnly, loadTarget, needBusiness, wrap(async (req, res) => {
  const { deleted, stock } = await deleteTransaction(bizId(req), req.params.recordId);
  await writeAudit(req.admin, { action: 'transaction.delete', level: 'warning', targetType: 'transaction', targetId: deleted.id, message: `${req.admin.email} deleted a ${deleted.type} (${deleted.product || deleted.title}, ${deleted.amount}) of ${req.target.business.name}`, details: { stock } });
  res.json({ ok: true, stock });
}));

/* ------------------------------------ stock ------------------------------------ */

const mapProduct = (r) => {
  const p = toProduct(r);
  return { ...p, status: { OUT: 'out-of-stock', LOW: 'low-stock' }[stockStatus(p)] || 'in-stock', value: Math.round(p.stock * p.cost * 100) / 100 };
};

// GET /admin/users/:id/products?search=&page=&limit=
router.get('/users/:id/products', loadTarget, needBusiness, wrap(async (req, res) => {
  const { page, limit } = readPaging(req.query, 10);
  const s = String(req.query.search || '').trim().toLowerCase();
  const rows = ok(await supabase.from('products').select('*').eq('business_id', bizId(req)).order('name')).map(mapProduct);
  const status = ['in-stock', 'low-stock', 'out-of-stock'].includes(req.query.status) ? req.query.status : null;
  const list = rows.filter((p) => (!s || `${p.name} ${p.category || ''}`.toLowerCase().includes(s)) && (!status || p.status === status));
  res.json(pageOf('products', list, page, limit));
}));

router.put('/users/:id/products/:recordId', loadTarget, needBusiness, wrap(async (req, res) => {
  const body = pick(req.body, ['name', 'category', 'price', 'cost', 'lowStockThreshold', 'stock']);
  const row = await updateProduct(bizId(req), req.params.recordId, body);
  await writeAudit(req.admin, { action: 'product.update', targetType: 'product', targetId: row.id, message: `${req.admin.email} edited the product ${row.name} of ${req.target.business.name}`, details: { fields: Object.keys(body) } });
  res.json(mapProduct(row));
}));

router.delete('/users/:id/products/:recordId', superOnly, loadTarget, needBusiness, wrap(async (req, res) => {
  const row = ok(await supabase.from('products').select('name').eq('id', req.params.recordId).eq('business_id', bizId(req)).maybeSingle());
  if (!row) throw notFound('Product not found.');
  await records.deleteProduct(bizId(req), req.params.recordId);
  await writeAudit(req.admin, { action: 'product.delete', level: 'warning', targetType: 'product', targetId: req.params.recordId, message: `${req.admin.email} deleted the product ${row.name} of ${req.target.business.name}` });
  res.json({ ok: true });
}));

/* ----------------------------------- services ----------------------------------- */

const mapService = (r) => ({ id: r.id, name: r.name, price: n(r.price), duration: r.duration || '', category: r.category || '' });

router.get('/users/:id/services', loadTarget, needBusiness, wrap(async (req, res) => {
  const { page, limit } = readPaging(req.query, 10);
  const s = String(req.query.search || '').trim().toLowerCase();
  const list = ok(await supabase.from('services').select('*').eq('business_id', bizId(req)).order('name'))
    .map(mapService)
    .filter((x) => !s || `${x.name} ${x.category}`.toLowerCase().includes(s));
  res.json(pageOf('services', list, page, limit));
}));

router.put('/users/:id/services/:recordId', loadTarget, needBusiness, wrap(async (req, res) => {
  const body = pick(req.body, ['name', 'price', 'duration', 'category']);
  const row = await records.updateService(bizId(req), req.params.recordId, body);
  await writeAudit(req.admin, { action: 'service.update', targetType: 'service', targetId: row.id, message: `${req.admin.email} edited the service ${row.name} of ${req.target.business.name}`, details: { fields: Object.keys(body) } });
  res.json(mapService(row));
}));

router.delete('/users/:id/services/:recordId', superOnly, loadTarget, needBusiness, wrap(async (req, res) => {
  const row = ok(await supabase.from('services').select('name').eq('id', req.params.recordId).eq('business_id', bizId(req)).maybeSingle());
  if (!row) throw notFound('Service not found.');
  await records.deleteService(bizId(req), req.params.recordId);
  await writeAudit(req.admin, { action: 'service.delete', level: 'warning', targetType: 'service', targetId: req.params.recordId, message: `${req.admin.email} deleted the service ${row.name} of ${req.target.business.name}` });
  res.json({ ok: true });
}));

/* ----------------------------------- customers ----------------------------------- */

router.get('/users/:id/customers', loadTarget, needBusiness, wrap(async (req, res) => {
  const { page, limit } = readPaging(req.query, 10);
  const s = String(req.query.search || '').trim().toLowerCase();
  const [rows, work] = await Promise.all([
    supabase.from('customers').select('*').eq('business_id', bizId(req)).order('name').then(ok),
    supabase.from('upcoming_work').select('customer_id, status, date').eq('business_id', bizId(req)).then(ok),
  ]);
  const list = rows
    .map((c) => {
      const mine = work.filter((w) => w.customer_id === c.id);
      const visits = mine.filter((w) => w.status === 'Completed');
      return {
        id: c.id,
        name: c.name,
        phone: c.phone || '',
        email: c.email || '',
        addedAt: saDate(c.created_at),
        bookings: mine.length,
        visits: visits.length,
        lastVisit: visits.map((w) => w.date).sort().pop() || null,
      };
    })
    .filter((c) => !s || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(s));
  res.json(pageOf('customers', list, page, limit));
}));

router.put('/users/:id/customers/:recordId', loadTarget, needBusiness, wrap(async (req, res) => {
  const body = pick(req.body, ['name', 'phone', 'email']);
  const row = await records.updateCustomer(bizId(req), req.params.recordId, body);
  await writeAudit(req.admin, { action: 'customer.update', targetType: 'customer', targetId: row.id, message: `${req.admin.email} edited the customer ${row.name} of ${req.target.business.name}`, details: { fields: Object.keys(body) } });
  res.json({ id: row.id, name: row.name, phone: row.phone || '', email: row.email || '' });
}));

router.delete('/users/:id/customers/:recordId', superOnly, loadTarget, needBusiness, wrap(async (req, res) => {
  const row = ok(await supabase.from('customers').select('name').eq('id', req.params.recordId).eq('business_id', bizId(req)).maybeSingle());
  if (!row) throw notFound('Customer not found.');
  await records.deleteCustomer(bizId(req), req.params.recordId);
  await writeAudit(req.admin, { action: 'customer.delete', level: 'warning', targetType: 'customer', targetId: req.params.recordId, message: `${req.admin.email} deleted the customer ${row.name} of ${req.target.business.name}` });
  res.json({ ok: true });
}));

/* ------------------------------------ bookings ------------------------------------ */

function mapBooking(r, customersById = new Map()) {
  return {
    id: r.id,
    date: r.date,
    time: r.time || '',
    title: r.title || r.service || '',
    service: r.service || '',
    customer: customersById.get(r.customer_id)?.name || '',
    status: r.status,
    statusLabel: BOOKING_LABEL[r.status] || r.status,
    price: r.price == null ? null : n(r.price),
    notes: r.notes || '',
    rescheduled: n(r.reschedule_count) > 0,
  };
}

// GET /admin/users/:id/bookings?status=&search=&page=&limit=   (newest date first)
router.get('/users/:id/bookings', loadTarget, needBusiness, wrap(async (req, res) => {
  const { page, limit } = readPaging(req.query, 10);
  const [rows, customers] = await Promise.all([
    supabase.from('upcoming_work').select('*').eq('business_id', bizId(req)).order('date', { ascending: false }).order('time', { ascending: false }).then(ok),
    supabase.from('customers').select('id, name').eq('business_id', bizId(req)).then(ok),
  ]);
  const byCustomer = new Map(customers.map((c) => [c.id, c]));
  const status = Object.keys(BOOKING_LABEL).includes(req.query.status) ? req.query.status : null;
  const s = String(req.query.search || '').trim().toLowerCase();
  const list = rows
    .map((r) => mapBooking(r, byCustomer))
    .filter((b) => (!status || b.status === status) && (!s || `${b.title} ${b.service} ${b.customer} ${b.notes}`.toLowerCase().includes(s)));
  res.json(pageOf('bookings', list, page, limit));
}));

// PUT /admin/users/:id/bookings/:recordId  -> status / notes / price (lib/bookings.js rules, income included)
router.put('/users/:id/bookings/:recordId', loadTarget, needBusiness, wrap(async (req, res) => {
  const body = pick(req.body, ['status', 'notes', 'price', 'title', 'service', 'date', 'time']);
  const row = await updateBooking(bizId(req), req.params.recordId, body);
  const customers = ok(await supabase.from('customers').select('id, name').eq('business_id', bizId(req)));
  await writeAudit(req.admin, { action: 'booking.update', targetType: 'booking', targetId: row.id, message: `${req.admin.email} updated a booking of ${req.target.business.name}${body.status ? ` (status: ${BOOKING_LABEL[row.status] || row.status})` : ''}`, details: { fields: Object.keys(body) } });
  res.json(mapBooking(row, new Map(customers.map((c) => [c.id, c]))));
}));

router.delete('/users/:id/bookings/:recordId', superOnly, loadTarget, needBusiness, wrap(async (req, res) => {
  const row = ok(await supabase.from('upcoming_work').select('title, service, date').eq('id', req.params.recordId).eq('business_id', bizId(req)).maybeSingle());
  if (!row) throw notFound('Booking not found.');
  await records.deleteBooking(bizId(req), req.params.recordId);
  await writeAudit(req.admin, { action: 'booking.delete', level: 'warning', targetType: 'booking', targetId: req.params.recordId, message: `${req.admin.email} deleted the booking "${row.title || row.service}" on ${row.date} of ${req.target.business.name}` });
  res.json({ ok: true });
}));

/* ------------------------------ subscription / payments ------------------------------ */

router.get('/users/:id/payments', loadTarget, needBusiness, wrap(async (req, res) => {
  const rows = ok(await supabase.from('payments').select('*').eq('business_id', bizId(req)).order('created_at', { ascending: false }).limit(50));
  res.json(rows.map((r) => ({ ...paymentDto(r), id: r.reference, date: saDate(r.paid_at || r.created_at) })));
}));

// POST /admin/users/:id/subscription/cancel | resume  (same as the app's Cancel / Resume buttons)
router.post('/users/:id/subscription/:action', loadTarget, needBusiness, wrap(async (req, res) => {
  const action = req.params.action;
  if (!['cancel', 'resume'].includes(action)) throw notFound('Not found.');
  const sub = action === 'cancel' ? await cancelAtPeriodEnd(bizId(req)) : await resumeSubscription(bizId(req));
  forgetAccounts();
  await writeAudit(req.admin, {
    action: `subscription.${action}`,
    level: action === 'cancel' ? 'warning' : 'info',
    targetType: 'business',
    targetId: bizId(req),
    message: `${req.admin.email} ${action === 'cancel' ? 'set to cancel at the end of the period' : 'resumed'} the ${sub.plan} plan of ${req.target.business.name}`,
  });
  res.json(sub);
}));

module.exports = router;
