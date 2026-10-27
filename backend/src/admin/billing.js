// Subscriptions & Payments. Plans and prices come from lib/plans.js (the server's single source of
// truth for what each plan costs and unlocks); subscriptions are read through lib/payments.subscriptionView
// (the app's own rules); payments use paymentDto and verifyAndSettle, the same code the app and the
// Paystack webhook use, so "re-check" can never activate a plan that Paystack hasn't confirmed.

const express = require('express');
const supabase = require('../supabaseClient');
const { wrap, ok, notFound } = require('../lib/http');
const { PLANS, ENTITLEMENTS } = require('../lib/plans');
const { findPayment, verifyAndSettle, paymentDto } = require('../lib/payments');
const { loadAccounts, forgetAccounts, filterAccounts, subscriptionStatusOf } = require('./accounts');
const { writeAudit } = require('./audit');
const { saDate, readPaging, pageOf, pageResult, cleanSearch, revenueMode, mapPayment, monthStart, addMonths, monthsBetween, todayInSA } = require('./util');

const router = express.Router();
const rand = (cents) => (Number(cents) || 0) / 100;
const PAYMENT_STATUSES = ['success', 'pending', 'failed', 'cancelled', 'expired', 'mismatch', 'refunded'];

/** What a plan unlocks, in words, worked out from the entitlements the server enforces. */
function featuresOf(id) {
  const e = ENTITLEMENTS[id] || ENTITLEMENTS.free;
  const out = [e.aiMessagesPerDay == null ? 'Unlimited AI Co-Founder chat' : `Up to ${e.aiMessagesPerDay} AI messages a day`];
  if (e.pricingAssistant) out.push('Pricing assistant');
  if (e.restockPlan) out.push('Restock recommendations');
  if (e.retentionInsights) out.push('Customer retention insights');
  if (e.growthInsights) out.push('Growth insights');
  if (e.multiBusiness) out.push('Multi-business support');
  if (e.adsIncludedPerMonth) out.push(`${e.adsIncludedPerMonth} Sponsored advert a month included`);
  if (e.adPurchase) out.push('Can buy Sponsored adverts');
  if (id === 'free') out.push('Sales, expenses, stock & bookings');
  return out;
}

// GET /admin/subscriptions/plans
router.get('/subscriptions/plans', wrap(async (req, res) => {
  const accounts = await loadAccounts();
  res.json(
    Object.values(PLANS)
      .sort((a, b) => a.rank - b.rank)
      .map((p) => ({
        id: p.id,
        name: p.name,
        price: p.priceMonthly,
        priceAnnual: p.priceAnnual,
        currency: 'ZAR',
        subscribers: accounts.filter((a) => a.subscription.planId === p.id).length,
        features: featuresOf(p.id),
      }))
  );
}));

// GET /admin/subscriptions?search=&plan=&status=&page=&limit=
router.get('/subscriptions', wrap(async (req, res) => {
  const { page, limit } = readPaging(req.query);
  const plan = ['free', 'pro', 'premium'].includes(String(req.query.plan)) ? String(req.query.plan) : null;
  const subscriptionStatus = ['active', 'cancelling', 'expired', 'free'].includes(String(req.query.status)) ? String(req.query.status) : null;
  const list = filterAccounts(await loadAccounts(), { search: req.query.search, plan, subscriptionStatus }).map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    business: a.business?.name || '—',
    plan: a.subscription.plan,
    planId: a.subscription.planId,
    status: subscriptionStatusOf(a),
    billingCycle: a.subscription.billingCycle || '—',
    subscribedAt: a.subscription.startedOn || '—',
    renewsAt: a.subscription.renewsOn || '—',
    expiredPlan: a.subscription.expiredPlan,
  }));
  res.json(pageOf('subscriptions', list, page, limit));
}));

// GET /admin/payments?search=&status=&page=&limit=
router.get('/payments', wrap(async (req, res) => {
  const { page, limit, from } = readPaging(req.query);
  const accounts = await loadAccounts();
  let q = supabase.from('payments').select('*', { count: 'exact' });
  const status = String(req.query.status || '') === 'successful' ? 'success' : String(req.query.status || '');
  if (PAYMENT_STATUSES.includes(status)) q = q.eq('status', status);
  const s = cleanSearch(req.query.search);
  if (s) {
    const ids = filterAccounts(accounts, { search: s }).slice(0, 200).map((a) => a.id);
    const parts = [`email.ilike.%${s}%`, `reference.ilike.%${s}%`];
    if (ids.length) parts.push(`user_id.in.(${ids.join(',')})`);
    q = q.or(parts.join(','));
  }
  const result = await q.order('created_at', { ascending: false }).range(from, from + limit - 1);
  const owners = new Map(accounts.map((a) => [a.id, a]));
  res.json(pageResult('payments', ok(result).map((r) => mapPayment(r, owners)), result.count, page, limit));
}));

// GET /admin/payments/summary  -> revenue cards and the last 6 months by plan
router.get('/payments/summary', wrap(async (req, res) => {
  const today = todayInSA();
  const mode = revenueMode();
  const sixFrom = addMonths(monthStart(today), -5);
  const [paid, open, review] = await Promise.all([
    (async () => {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const batch = ok(await supabase.from('payments').select('amount, plan_id, paid_at').eq('status', 'success').eq('mode', mode).order('id').range(from, from + 999));
        rows.push(...batch);
        if (batch.length < 1000) return rows;
      }
    })(),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending').gt('expires_at', new Date().toISOString()),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'mismatch'),
  ]);
  ok(open);
  ok(review);
  const months = new Map(monthsBetween(sixFrom, today).map((m) => [m.key, { month: m.label, pro: 0, premium: 0 }]));
  let total = 0;
  let thisMonth = 0;
  paid.forEach((p) => {
    const amount = rand(p.amount);
    total += amount;
    const day = saDate(p.paid_at);
    if (day && day >= monthStart(today)) thisMonth += amount;
    const bucket = day && months.get(day.slice(0, 7));
    if (bucket && bucket[p.plan_id] !== undefined) bucket[p.plan_id] += amount;
  });
  res.json({
    revenueMode: mode,
    verifiedRevenue: Math.round(total * 100) / 100,
    thisMonth: Math.round(thisMonth * 100) / 100,
    paidCount: paid.length,
    pending: open.count || 0,
    needsReview: review.count || 0,
    trend: [...months.values()],
  });
}));

// POST /admin/payments/:reference/verify  -> ask Paystack again and settle (never activates unverified money)
router.post('/payments/:reference/verify', wrap(async (req, res) => {
  const reference = String(req.params.reference || '').slice(0, 100);
  const payment = await findPayment(reference);
  if (!payment) throw notFound('Payment not found.');
  const before = payment.status;
  const settled = await verifyAndSettle(payment, { source: 'admin' });
  forgetAccounts();
  await writeAudit(req.admin, {
    action: 'payment.verify',
    level: settled.status === 'mismatch' ? 'warning' : 'info',
    targetType: 'payment',
    targetId: reference,
    message: `${req.admin.email} re-checked payment ${reference} with Paystack: ${before} → ${settled.status}`,
  });
  res.json({ ...paymentDto(settled), id: settled.reference, date: saDate(settled.paid_at || settled.created_at) });
}));

module.exports = router;
