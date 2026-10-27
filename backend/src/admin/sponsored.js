// Sponsored adverts in the admin portal: the review queue, approving / rejecting / suspending adverts and
// business-page changes, user reports, advertising packages and prices, advertising payments, and figures.
// Every decision goes through lib/sponsored.js (the same rules the app uses) and is written to the audit log.
// An advert can only be approved when a confirmed payment (or the Premium allowance) covers it.

const express = require('express');
const supabase = require('../supabaseClient');
const { wrap, ok, badRequest, notFound, HttpError, escapeLike, isUuid } = require('../lib/http');
const rules = require('../lib/sponsoredRules');
const sponsored = require('../lib/sponsored');
const adPay = require('../lib/sponsoredPayments');
const { loadAccounts } = require('./accounts');
const { requireRole } = require('./auth');
const { writeAudit } = require('./audit');
const { readPaging, pageResult, cleanSearch, revenueMode, saDate, monthStart, todayInSA, addDays } = require('./util');

const router = express.Router();
const { T } = sponsored;
const rand = (cents) => (Number(cents) || 0) / 100;
const label = (id) => rules.CATEGORIES.find((c) => c.id === id)?.label || id;

// Errors with a code keep it (e.g. not_paid), so the portal can explain what is missing.
const act = (fn) => wrap(async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof HttpError && err.code) return res.status(err.status).json({ error: err.message, code: err.code });
    throw err;
  }
});
// Every Sponsored admin route first checks the tables exist (once), so a missing sponsored.sql gives a clear
// message instead of a generic error.
let setupOk = false;
router.use('/sponsored', wrap(async (req, res, next) => {
  if (setupOk) return next();
  const problem = await sponsored.checkSetup();
  if (problem) return res.status(503).json({ error: `Sponsored is not set up: ${problem}.`, code: 'sponsored_not_setup' });
  setupOk = true;
  next();
}));

const adParam = (req, res, next) => (isUuid(req.params.id) ? next() : res.status(404).json({ error: 'Advert not found.' }));

/** Owner accounts by id (cached for a few seconds by accounts.js). */
async function owners() {
  const accounts = await loadAccounts();
  return new Map(accounts.map((a) => [a.id, a]));
}

async function profilesFor(businessIds) {
  if (!businessIds.length) return new Map();
  const rows = ok(await supabase.from(T.profiles).select('business_id, published, draft, review_status').in('business_id', businessIds));
  return new Map(rows.map((r) => [r.business_id, r]));
}
async function businessesFor(ids) {
  if (!ids.length) return new Map();
  const rows = ok(await supabase.from('businesses').select('id, name, type, location, owner_id').in('id', ids));
  return new Map(rows.map((r) => [r.id, r]));
}
async function openReportCounts(adIds) {
  if (!adIds.length) return new Map();
  const rows = ok(await supabase.from(T.reports).select('ad_id').in('ad_id', adIds).eq('status', 'open'));
  const m = new Map();
  rows.forEach((r) => m.set(r.ad_id, (m.get(r.ad_id) || 0) + 1));
  return m;
}

/** One advert as a row in the portal's tables. */
function adRow(ad, { profile, business, owner, reports = 0, order = null }) {
  const page = profile?.published || profile?.draft;
  return {
    id: ad.id,
    title: ad.title,
    imageUrl: ad.image_url,
    business: page?.displayName || business?.name || 'Unnamed business',
    businessId: ad.business_id,
    ownerId: ad.owner_id,
    owner: owner?.name || '',
    ownerEmail: owner?.email || '',
    category: ad.category,
    categoryLabel: label(ad.category),
    packageId: ad.package_id,
    placement: ad.placement,
    funding: ad.funding,
    price: rand(ad.price_cents),
    status: ad.account_suspended && ad.status === 'approved' ? 'account_suspended' : rules.effectiveStatus(ad),
    storedStatus: ad.status,
    submittedAt: ad.submitted_at,
    startsAt: ad.starts_at,
    endsAt: ad.ends_at,
    daysLeft: ad.status === 'approved' ? rules.daysLeft(ad) : null,
    changesPending: ad.revision_status === 'pending',
    reports,
    payment: order ? { reference: order.reference, status: order.status, refundStatus: order.refund_status } : null,
    createdAt: ad.created_at,
  };
}

/* ----------------------------------- summary ----------------------------------- */

// GET /admin/sponsored/summary -> queue, adverts by status, advertising revenue, engagement by category
router.get('/sponsored/summary', act(async (req, res) => {
  const today = todayInSA();
  const since = addDays(today, -29);
  const mode = revenueMode();
  const [queue, ads, paid, refunds, categories, pkgs] = await Promise.all([
    sponsored.reviewQueueCounts(),
    supabase.from(T.ads).select('status, starts_at, ends_at, account_suspended, placement').limit(10000),
    supabase.from(T.orders).select('amount, paid_at, package_id').eq('kind', 'paid').eq('status', 'success').eq('mode', mode).limit(10000),
    supabase.from(T.orders).select('id', { count: 'exact', head: true }).eq('refund_status', 'requested'),
    supabase.rpc('sponsored_category_summary', { p_since: since }),
    sponsored.listPackages({ includeInactive: true }),
  ]);
  for (const r of [ads, paid, refunds, categories]) if (r.error) throw sponsoredError(r.error);

  const byStatus = {};
  let live = 0;
  ok(ads).forEach((a) => {
    const s = rules.effectiveStatus(a);
    byStatus[s] = (byStatus[s] || 0) + 1;
    if (rules.isLive(a)) live += 1;
  });

  let total = 0;
  let thisMonth = 0;
  const perPackage = new Map();
  ok(paid).forEach((o) => {
    const amount = rand(o.amount);
    total += amount;
    if ((saDate(o.paid_at) || '') >= monthStart(today)) thisMonth += amount;
    const p = perPackage.get(o.package_id) || { sold: 0, revenue: 0 };
    p.sold += 1;
    p.revenue += amount;
    perPackage.set(o.package_id, p);
  });

  const cat = new Map();
  (categories.data || []).forEach((r) => {
    const c = cat.get(r.category) || { category: r.category, label: label(r.category), ...sponsored.emptyTotals() };
    if (r.event in c) c[r.event] += Number(r.n) || 0;
    cat.set(r.category, c);
  });
  const engagement = [...cat.values()]
    .map((c) => ({ category: c.category, label: c.label, impressions: c.impression, clicks: c.click, pageViews: c.detail_view, contacts: c.website_click + c.whatsapp_click + c.call_click + c.email_click, clickRate: c.impression ? Math.round((c.click / c.impression) * 1000) / 10 : null }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  res.json({
    queue,
    live,
    byStatus,
    revenue: { mode, total: Math.round(total * 100) / 100, thisMonth: Math.round(thisMonth * 100) / 100, paidCount: ok(paid).length, refundsRequested: refunds.count || 0 },
    packages: pkgs.filter((p) => !p.is_included).map((p) => ({ ...sponsored.packageDto(p), ...(perPackage.get(p.id) || { sold: 0, revenue: 0 }) })),
    engagement,
    engagementSince: since,
    categories: rules.CATEGORIES,
  });
}));

function sponsoredError(error) {
  if (/does not exist|could not find/i.test(error?.message || '') || error?.code === 'PGRST205' || error?.code === '42P01' || error?.code === 'PGRST202') {
    return new HttpError(503, 'The Sponsored tables are missing. Run backend/supabase/sponsored.sql in the Supabase SQL Editor.');
  }
  console.error('[admin/sponsored]', error?.message || error);
  return new HttpError(500, 'Something went wrong loading adverts.');
}

/* ----------------------------------- adverts ----------------------------------- */

const LIST_FILTERS = ['review', 'changes', 'active', 'scheduled', 'expired', 'awaiting_payment', 'rejected', 'suspended', 'removed', 'withdrawn'];

// GET /admin/sponsored/ads?status=&search=&category=&page=&limit=
router.get('/sponsored/ads', act(async (req, res) => {
  const { page, limit, from } = readPaging(req.query, 10);
  const status = LIST_FILTERS.includes(String(req.query.status)) ? String(req.query.status) : null;
  const now = new Date().toISOString();
  let q = supabase.from(T.ads).select(sponsored.AD_COLUMNS, { count: 'exact' });
  if (status === 'review') q = q.eq('status', 'pending_review');
  else if (status === 'changes') q = q.eq('status', 'approved').eq('revision_status', 'pending');
  else if (status === 'active') q = q.eq('status', 'approved').lte('starts_at', now).gt('ends_at', now);
  else if (status === 'scheduled') q = q.eq('status', 'approved').gt('starts_at', now);
  else if (status === 'expired') q = q.or(`status.eq.expired,and(status.eq.approved,ends_at.lte.${now})`);
  else if (status) q = q.eq('status', status);
  if (rules.isCategory(String(req.query.category || ''))) q = q.eq('category', String(req.query.category));
  const s = cleanSearch(req.query.search);
  if (s) {
    const accounts = await loadAccounts();
    const ownerIds = accounts.filter((a) => `${a.name} ${a.email} ${a.business?.name || ''}`.toLowerCase().includes(s.toLowerCase())).slice(0, 200).map((a) => a.id);
    const parts = [`title.ilike.%${s}%`, `description.ilike.%${s}%`];
    if (ownerIds.length) parts.push(`owner_id.in.(${ownerIds.join(',')})`);
    q = q.or(parts.join(','));
  }
  // The review queue is oldest first (fair), everything else newest first.
  q = status === 'review' ? q.order('submitted_at', { ascending: true }) : q.order('created_at', { ascending: false });
  const result = await q.range(from, from + limit - 1);
  if (result.error) throw sponsoredError(result.error);
  const rows = result.data || [];
  const bizIds = [...new Set(rows.map((a) => a.business_id))];
  const adIds = rows.map((a) => a.id);
  const [profiles, businesses, accounts, reports, orders] = await Promise.all([profilesFor(bizIds), businessesFor(bizIds), owners(), openReportCounts(adIds), sponsored.latestOrders(adIds)]);
  res.json(pageResult('ads', rows.map((a) => adRow(a, { profile: profiles.get(a.business_id), business: businesses.get(a.business_id), owner: accounts.get(a.owner_id), reports: reports.get(a.id) || 0, order: orders.get(a.id) })), result.count, page, limit));
}));

/** Other businesses using the same picture or the same title (possible copying / impersonation). */
async function similarAds(ad) {
  const found = new Map();
  if (ad.image_url) ok(await supabase.from(T.ads).select('id, business_id').eq('image_url', ad.image_url).neq('business_id', ad.business_id).limit(5)).forEach((r) => found.set(r.business_id, r));
  if (ad.title && ad.title.length >= 6) ok(await supabase.from(T.ads).select('id, business_id').ilike('title', escapeLike(ad.title)).neq('business_id', ad.business_id).limit(5)).forEach((r) => found.set(r.business_id, r));
  if (!found.size) return [];
  const profiles = await profilesFor([...found.keys()]);
  const businesses = await businessesFor([...found.keys()]);
  return [...found.keys()].map((id) => ({ businessId: id, businessName: profiles.get(id)?.published?.displayName || businesses.get(id)?.name || 'unknown' }));
}

// GET /admin/sponsored/ads/:id -> everything needed to review an advert
router.get('/sponsored/ads/:id', adParam, act(async (req, res) => {
  const ad = await sponsored.getAdRow(req.params.id);
  if (!ad) throw notFound('Advert not found.');
  const [profileRow, businesses, accounts, orders, stats, history, reports, similar] = await Promise.all([
    sponsored.getProfileRow(ad.business_id),
    businessesFor([ad.business_id]),
    owners(),
    supabase.from(T.orders).select('*').eq('ad_id', ad.id).order('created_at', { ascending: false }),
    sponsored.adStats(ad, 30),
    sponsored.historyOf(ad.id),
    supabase.from(T.reports).select('id, reason, details, status, created_at').eq('ad_id', ad.id).order('created_at', { ascending: false }).limit(50),
    similarAds(ad),
  ]);
  const business = businesses.get(ad.business_id);
  const owner = accounts.get(ad.owner_id);
  const pageForReview = profileRow?.draft || profileRow?.published;
  const openReports = ok(reports).filter((r) => r.status === 'open').length;
  res.json({
    ad: { ...adRow(ad, { profile: profileRow, business, owner, reports: openReports }), description: ad.description, durationDays: ad.duration_days, reviewNote: ad.review_note, renewedFrom: ad.renewed_from, paidAt: ad.paid_at },
    changes: ad.revision_status === 'pending' ? { ...ad.pending_changes, imageUrl: ad.pending_changes?.image_url } : null,
    profile: {
      published: profileRow?.published || null,
      draft: profileRow?.draft || null,
      reviewStatus: profileRow?.review_status || 'none',
      reviewNote: profileRow?.review_note || null,
      problems: rules.profileProblems(pageForReview),
    },
    registeredBusiness: business ? { name: business.name, type: business.type, location: business.location } : null,
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email, plan: owner.subscription?.plan, status: owner.status, registeredAt: owner.registeredAt } : null,
    orders: ok(orders).map(adPay.orderDto),
    stats,
    history,
    reports: ok(reports),
    flags: rules.moderationFlags({ ad, profile: pageForReview, registeredName: business?.name, similarAds: similar, openReports }),
  });
}));

const adAction = (path, verb, run, { level = 'info' } = {}) => router.post(`/sponsored/ads/:id/${path}`, adParam, act(async (req, res) => {
  const ad = await run(req);
  await writeAudit(req.admin, { action: `sponsored.${path.replace('/', '_')}`, level, targetType: 'sponsored_ad', targetId: ad.id, message: `${req.admin.email} ${verb} the advert "${ad.title}"${req.body?.reason ? `: ${String(req.body.reason).slice(0, 200)}` : ''}` });
  res.json({ ok: true, status: rules.effectiveStatus(ad), startsAt: ad.starts_at, endsAt: ad.ends_at });
}));

adAction('approve', 'approved', (req) => sponsored.approveAd(req.admin, req.params.id, { startsAt: req.body?.startsAt }));
adAction('reject', 'rejected', (req) => sponsored.rejectAd(req.admin, req.params.id, req.body?.reason));
adAction('suspend', 'suspended', (req) => sponsored.suspendAd(req.admin, req.params.id, req.body?.reason), { level: 'warning' });
adAction('reinstate', 'reinstated', (req) => sponsored.reinstateAd(req.admin, req.params.id));
adAction('remove', 'removed', (req) => sponsored.removeAd(req.admin, req.params.id, req.body?.reason), { level: 'warning' });
adAction('changes/approve', 'approved the changes to', (req) => sponsored.decideRevision(req.admin, req.params.id, { approve: true }));
adAction('changes/reject', 'rejected the changes to', (req) => sponsored.decideRevision(req.admin, req.params.id, { approve: false, reason: req.body?.reason }));

/* ----------------------------------- business pages ----------------------------------- */

// GET /admin/sponsored/profiles -> business-page changes waiting for review
router.get('/sponsored/profiles', act(async (req, res) => {
  const { page, limit, from } = readPaging(req.query, 10);
  const result = await supabase.from(T.profiles).select('*', { count: 'exact' }).eq('review_status', 'pending').order('draft_updated_at', { ascending: true }).range(from, from + limit - 1);
  if (result.error) throw sponsoredError(result.error);
  const rows = result.data || [];
  const businesses = await businessesFor(rows.map((r) => r.business_id));
  const accounts = await owners();
  res.json(pageResult('profiles', rows.map((r) => {
    const b = businesses.get(r.business_id);
    const owner = b ? accounts.get(b.owner_id) : null;
    return {
      businessId: r.business_id,
      registeredName: b?.name || '',
      ownerId: b?.owner_id || null,
      owner: owner?.name || '',
      ownerEmail: owner?.email || '',
      published: r.published,
      draft: r.draft,
      problems: rules.profileProblems(r.draft),
      flags: rules.moderationFlags({ ad: {}, profile: r.draft, registeredName: b?.name }).filter((f) => f.code !== 'no_image'),
      submittedAt: r.draft_updated_at,
    };
  }), result.count, page, limit));
}));

router.post('/sponsored/profiles/:businessId/:decision(approve|reject)', act(async (req, res) => {
  if (!isUuid(req.params.businessId)) throw notFound('Business not found.');
  const approve = req.params.decision === 'approve';
  let reason = null;
  if (approve) await sponsored.publishProfile(req.params.businessId, req.admin);
  else {
    reason = String(req.body?.reason || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (reason.length < 5) throw badRequest('Give a reason (the business owner sees it).');
    await sponsored.rejectProfile(req.params.businessId, req.admin, reason);
  }
  await writeAudit(req.admin, { action: `sponsored.profile_${req.params.decision}`, targetType: 'business', targetId: req.params.businessId, message: `${req.admin.email} ${approve ? 'approved' : 'rejected'} business page changes${reason ? `: ${reason}` : ''}` });
  res.json({ ok: true });
}));

/* ----------------------------------- reports ----------------------------------- */

// GET /admin/sponsored/reports?status=open|dismissed|actioned
router.get('/sponsored/reports', act(async (req, res) => {
  const { page, limit, from } = readPaging(req.query, 10);
  const status = ['open', 'dismissed', 'actioned'].includes(String(req.query.status)) ? String(req.query.status) : 'open';
  const result = await supabase.from(T.reports).select('id, ad_id, reason, details, status, created_at', { count: 'exact' }).eq('status', status).order('created_at', { ascending: false }).range(from, from + limit - 1);
  if (result.error) throw sponsoredError(result.error);
  const rows = result.data || [];
  const adIds = [...new Set(rows.map((r) => r.ad_id))];
  const ads = adIds.length ? ok(await supabase.from(T.ads).select('id, title, business_id, status, starts_at, ends_at').in('id', adIds)) : [];
  const adMap = new Map(ads.map((a) => [a.id, a]));
  const profiles = await profilesFor([...new Set(ads.map((a) => a.business_id))]);
  res.json(pageResult('reports', rows.map((r) => {
    const ad = adMap.get(r.ad_id);
    return { ...r, adTitle: ad?.title || '', adStatus: ad ? rules.effectiveStatus(ad) : null, business: profiles.get(ad?.business_id)?.published?.displayName || '' };
  }), result.count, page, limit));
}));

router.post('/sponsored/reports/:id/:decision(dismiss|actioned)', act(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw notFound('Report not found.');
  const status = req.params.decision === 'dismiss' ? 'dismissed' : 'actioned';
  const rows = ok(await supabase.from(T.reports).update({ status }).eq('id', id).select('id, ad_id'));
  if (!rows.length) throw notFound('Report not found.');
  await writeAudit(req.admin, { action: `sponsored.report_${status}`, targetType: 'sponsored_ad', targetId: rows[0].ad_id, message: `${req.admin.email} marked a report as ${status}` });
  res.json({ ok: true });
}));

/* ----------------------------------- packages ----------------------------------- */

router.get('/sponsored/packages', act(async (req, res) => {
  res.json((await sponsored.listPackages({ includeInactive: true })).map(sponsored.packageDto));
}));

// PUT /admin/sponsored/packages/:id { name, description, price, durationDays, placement, active } (super admins)
// Running campaigns keep what they were bought with; new purchases use the new values.
router.put('/sponsored/packages/:id', requireRole('super_admin'), act(async (req, res) => {
  const pkg = await sponsored.getPackage(req.params.id);
  if (!pkg) throw notFound('Package not found.');
  const b = req.body || {};
  const update = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) {
    const name = String(b.name).replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 40) throw badRequest('Name must be 2 to 40 characters.');
    update.name = name;
  }
  if (b.description !== undefined) update.description = String(b.description).replace(/\s+/g, ' ').trim().slice(0, 200);
  if (b.price !== undefined && !pkg.is_included) {
    const price = Number(String(b.price).replace(',', '.'));
    if (!Number.isFinite(price) || price < 5 || price > 100000) throw badRequest('Price must be between R5 and R100 000.');
    update.price_cents = Math.round(price * 100);
  }
  if (b.durationDays !== undefined) {
    const d = parseInt(b.durationDays, 10);
    if (!Number.isFinite(d) || d < 1 || d > 365) throw badRequest('Duration must be 1 to 365 days.');
    update.duration_days = d;
  }
  if (b.placement !== undefined) {
    if (!(b.placement in rules.PLACEMENT_RANK)) throw badRequest('Placement must be standard, featured or priority.');
    update.placement = b.placement;
  }
  if (b.active !== undefined) update.is_active = Boolean(b.active);
  const row = ok(await supabase.from(T.packages).update(update).eq('id', pkg.id).select().single());
  const changed = Object.keys(update).filter((k) => k !== 'updated_at');
  await writeAudit(req.admin, { action: 'sponsored.package_update', level: 'warning', targetType: 'sponsored_package', targetId: pkg.id, message: `${req.admin.email} changed the ${pkg.name} package (${changed.join(', ')})`, details: { before: sponsored.packageDto(pkg), after: sponsored.packageDto(row) } });
  res.json(sponsored.packageDto(row));
}));

/* ----------------------------------- advertising payments ----------------------------------- */

// GET /admin/sponsored/orders?status=&refund=requested&search=&page=
router.get('/sponsored/orders', act(async (req, res) => {
  const { page, limit, from } = readPaging(req.query, 10);
  let q = supabase.from(T.orders).select('*', { count: 'exact' });
  const status = String(req.query.status || '');
  if (['pending', 'success', 'failed', 'cancelled', 'expired', 'mismatch', 'refunded'].includes(status)) q = q.eq('status', status);
  if (String(req.query.refund) === 'requested') q = q.eq('refund_status', 'requested');
  if (String(req.query.kind) === 'paid' || String(req.query.kind) === 'included') q = q.eq('kind', String(req.query.kind));
  const s = cleanSearch(req.query.search);
  if (s) q = q.or(`email.ilike.%${s}%,reference.ilike.%${s}%`);
  const result = await q.order('created_at', { ascending: false }).range(from, from + limit - 1);
  if (result.error) throw sponsoredError(result.error);
  const rows = result.data || [];
  const adIds = [...new Set(rows.map((r) => r.ad_id))];
  const ads = adIds.length ? ok(await supabase.from(T.ads).select('id, title').in('id', adIds)) : [];
  const titles = new Map(ads.map((a) => [a.id, a.title]));
  const accounts = await owners();
  res.json(pageResult('orders', rows.map((o) => ({
    ...adPay.orderDto(o),
    id: o.reference,
    adTitle: titles.get(o.ad_id) || '',
    userId: o.user_id,
    user: accounts.get(o.user_id)?.name || o.email || '',
    email: o.email || '',
    date: saDate(o.paid_at || o.created_at),
    failureReason: o.failure_reason || null,
  })), result.count, page, limit));
}));

// POST /admin/sponsored/orders/:reference/verify -> ask Paystack again (never moves an advert on unverified money)
router.post('/sponsored/orders/:reference/verify', act(async (req, res) => {
  const order = await adPay.findOrder(String(req.params.reference).slice(0, 100));
  if (!order) throw notFound('Payment not found.');
  const before = order.status;
  const settled = await adPay.verifyAndSettleOrder(order, { source: 'admin' });
  await writeAudit(req.admin, { action: 'sponsored.payment_verify', level: settled.status === 'mismatch' ? 'warning' : 'info', targetType: 'sponsored_order', targetId: order.reference, message: `${req.admin.email} re-checked advert payment ${order.reference} with Paystack: ${before} → ${settled.status}` });
  res.json(adPay.orderDto(settled));
}));

// POST /admin/sponsored/orders/:reference/refunded -> after refunding in the Paystack dashboard (also arrives
// by webhook as refund.processed). The advert it paid for stops. Super admins only.
router.post('/sponsored/orders/:reference/refunded', requireRole('super_admin'), act(async (req, res) => {
  const order = await adPay.findOrder(String(req.params.reference).slice(0, 100));
  if (!order) throw notFound('Payment not found.');
  if (order.kind !== 'paid' || !['success', 'refunded'].includes(order.status)) throw badRequest('Only successful payments can be marked as refunded.');
  const outcome = await adPay.handleOrderRefund(order.reference, { admin: req.admin });
  await writeAudit(req.admin, { action: 'sponsored.payment_refunded', level: 'warning', targetType: 'sponsored_order', targetId: order.reference, message: `${req.admin.email} marked advert payment ${order.reference} as refunded (R${rand(order.amount)})` });
  res.json({ ok: true, outcome });
}));

module.exports = router;
