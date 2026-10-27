// Dashboard, Monitoring, notifications and the top-bar search. Every number is worked out from real
// rows in the shared database; nothing is estimated or invented.

const express = require('express');
const supabase = require('../supabaseClient');
const { wrap, ok } = require('../lib/http');
const paystack = require('../lib/paystack');
const llm = require('../lib/llm');
const { lowStockProducts, outOfStockProducts } = require('../lib/aiEngine');
const { toProduct } = require('../lib/rows');
const { loadAccounts, fetchAll, filterAccounts } = require('./accounts');
const { prefsOf } = require('./auth');
const {
  saDate, readDate, within, saDayStartIso, saDayEndIso, addDays, addMonths, monthStart, dayLabel, monthsBetween,
  pct, readPaging, revenueMode, countRows, mapPayment, mapUser, isTableMissing, todayInSA,
} = require('./util');

const router = express.Router();
const STARTED_AT = new Date().toISOString();
const byId = (accounts) => new Map(accounts.map((a) => [a.id, a]));
const rand = (cents) => (Number(cents) || 0) / 100;

/** Successful payments in the current payment mode, optionally paid between two SA dates. */
function paidPayments({ from, to, columns = 'amount, plan_id, paid_at, created_at' } = {}) {
  return fetchAll(() => {
    let q = supabase.from('payments').select(columns).eq('status', 'success').eq('mode', revenueMode()).order('id');
    if (from) q = q.gte('paid_at', saDayStartIso(from));
    if (to) q = q.lte('paid_at', saDayEndIso(to));
    return q;
  });
}

/* --------------------------------- dashboard --------------------------------- */

// GET /admin/dashboard/summary?from=&to=
router.get('/dashboard/summary', wrap(async (req, res) => {
  const from = readDate(req.query.from);
  const to = readDate(req.query.to);
  const today = todayInSA();
  const since30 = addDays(today, -30);

  const txnRange = (q) => {
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);
    return q;
  };

  const [accounts, paid, recentTxn, recentWork, products, transactions, bookings, upcomingBookings, customers, services] = await Promise.all([
    loadAccounts(),
    paidPayments({ from, to }),
    fetchAll(() => supabase.from('transactions').select('business_id').gte('created_at', saDayStartIso(since30)).order('id')),
    fetchAll(() => supabase.from('upcoming_work').select('business_id').gte('created_at', saDayStartIso(since30)).order('id')),
    fetchAll(() => supabase.from('products').select('stock, low_stock_threshold').order('id')),
    countRows('transactions', txnRange),
    countRows('upcoming_work', txnRange),
    countRows('upcoming_work', (q) => q.in('status', ['Pending', 'Confirmed']).gte('date', today)),
    countRows('customers'),
    countRows('services'),
  ]);

  const inRange = accounts.filter((a) => within(a.registeredAt, from, to));
  const activeBusinesses = new Set([...recentTxn, ...recentWork].map((r) => r.business_id));
  const signedInRecently = (a) => a.lastSignInAt && saDate(a.lastSignInAt) >= since30;
  const plans = { free: 0, pro: 0, premium: 0 };
  inRange.forEach((a) => {
    plans[a.subscription.planId] = (plans[a.subscription.planId] || 0) + 1;
  });

  const revenueByPlan = { pro: 0, premium: 0 };
  paid.forEach((p) => {
    if (revenueByPlan[p.plan_id] !== undefined) revenueByPlan[p.plan_id] += rand(p.amount);
  });

  const productRows = products.map(toProduct);
  const body = {
    totalUsers: inRange.length,
    totalBusinesses: accounts.filter((a) => a.business && within(a.business.createdAt, from, to)).length,
    activeUsers: inRange.filter((a) => a.status === 'active' && (signedInRecently(a) || (a.business && activeBusinesses.has(a.business.id)))).length,
    freeSubscribers: plans.free,
    paidSubscribers: plans.pro + plans.premium,
    verifiedRevenue: Math.round(paid.reduce((s, p) => s + rand(p.amount), 0) * 100) / 100,
    revenueMode: revenueMode(),
    plans,
    revenueByPlan: [
      { label: 'Pro', revenue: revenueByPlan.pro },
      { label: 'Premium', revenue: revenueByPlan.premium },
    ],
    activity: {
      transactions,
      bookings,
      upcomingBookings,
      customers,
      products: productRows.length,
      lowStock: lowStockProducts(productRows).length + outOfStockProducts(productRows).length,
      services,
    },
    trends: null,
  };

  // "This month" trends, only for the unfiltered view (a custom date range has no "last month").
  if (!from && !to) {
    const thisMonth = monthStart(today);
    const prevMonth = addMonths(thisMonth, -1);
    const dayOfMonth = Number(today.slice(8, 10));
    // The same number of days at the start of last month (never past its last day), like the app's analytics.
    const prevLast = addDays(thisMonth, -1);
    const prevSameDay = [addDays(prevMonth, dayOfMonth - 1), prevLast].sort()[0];
    const usersBefore = accounts.filter((a) => saDate(a.registeredAt) < thisMonth).length;
    const businessesBefore = accounts.filter((a) => a.business && saDate(a.business.createdAt) < thisMonth).length;
    const [nowRev, prevRev] = await Promise.all([paidPayments({ from: thisMonth, to: today }), paidPayments({ from: prevMonth, to: prevSameDay })]);
    const sum = (rows) => rows.reduce((s, p) => s + rand(p.amount), 0);
    body.trends = {
      totalUsers: pct(accounts.length, usersBefore),
      totalBusinesses: pct(body.totalBusinesses, businessesBefore),
      verifiedRevenue: pct(sum(nowRev), sum(prevRev)),
    };
  }
  res.json(body);
}));

// GET /admin/dashboard/registrations?from=&to=   (default: the last 6 months)
router.get('/dashboard/registrations', wrap(async (req, res) => {
  const today = todayInSA();
  const to = readDate(req.query.to) || today;
  const from = readDate(req.query.from) || addMonths(monthStart(today), -5);
  const accounts = await loadAccounts();
  const counts = new Map(monthsBetween(from, to).map((m) => [m.key, { month: m.label, users: 0 }]));
  accounts.forEach((a) => {
    const day = saDate(a.registeredAt);
    if (day && day >= from && day <= to) {
      const bucket = counts.get(day.slice(0, 7));
      if (bucket) bucket.users += 1;
    }
  });
  res.json([...counts.values()]);
}));

// GET /admin/dashboard/recent-users?limit=5
router.get('/dashboard/recent-users', wrap(async (req, res) => {
  const { limit } = readPaging(req.query, 5);
  res.json((await loadAccounts()).slice(0, limit).map(mapUser));
}));

// GET /admin/dashboard/recent-payments?limit=5
router.get('/dashboard/recent-payments', wrap(async (req, res) => {
  const { limit } = readPaging(req.query, 5);
  const [rows, accounts] = await Promise.all([
    supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(limit).then(ok),
    loadAccounts(),
  ]);
  const owners = byId(accounts);
  res.json(rows.map((r) => mapPayment(r, owners)));
}));

/* --------------------------------- monitoring --------------------------------- */

async function aiUsageReport() {
  const today = todayInSA();
  const from = addDays(today, -6);
  // Is AI usage being recorded at all? (backend/supabase/admin.sql creates the table.)
  const probe = await supabase.from('ai_usage_events').select('id', { head: true, count: 'exact' });
  if (probe.error) {
    if (isTableMissing(probe.error)) return { available: false };
    ok(probe);
  }
  const rows = await fetchAll(() => supabase.from('ai_usage_events').select('created_at, ok, duration_ms, total_tokens').gte('created_at', saDayStartIso(from)).order('id'));
  const days = new Map();
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    days.set(d, { day: dayLabel(d), date: d, requests: 0, tokens: 0, errors: 0, ms: 0 });
  }
  rows.forEach((r) => {
    const b = days.get(saDate(r.created_at));
    if (!b) return;
    b.requests += 1;
    b.tokens += Number(r.total_tokens) || 0;
    b.ms += Number(r.duration_ms) || 0;
    if (!r.ok) b.errors += 1;
  });
  const t = days.get(today);
  const week = [...days.values()];
  const weekRequests = week.reduce((s, d) => s + d.requests, 0);
  const weekErrors = week.reduce((s, d) => s + d.errors, 0);
  return {
    available: true,
    totalRequests: t.requests,
    tokensUsed: t.tokens,
    avgResponseMs: t.requests ? Math.round(t.ms / t.requests) : null,
    errorRate: t.requests ? Math.round((t.errors / t.requests) * 1000) / 10 : null,
    weekRequests,
    weekErrorRate: weekRequests ? Math.round((weekErrors / weekRequests) * 1000) / 10 : null,
    trend: week.map(({ day, date, requests, tokens }) => ({ day, date, requests, tokens })),
  };
}

const PAY_REASON = {
  missing_key: 'PAYSTACK_SECRET_KEY is not set',
  invalid_key: 'PAYSTACK_SECRET_KEY is not a valid key',
  live_not_allowed: 'Live key set but PAYSTACK_ALLOW_LIVE is not true',
};

// GET /admin/monitoring/status
router.get('/monitoring/status', wrap(async (req, res) => {
  const started = Date.now();
  const ping = await supabase.from('businesses').select('id', { head: true, count: 'exact' });
  const dbLatency = Date.now() - started;

  const [audit, payEvents, ai] = await Promise.all([
    supabase.from('admin_audit_log').select('id, level, message, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('payment_events').select('event_key, event, reference, outcome, received_at').order('received_at', { ascending: false }).limit(10),
    aiUsageReport(),
  ]);

  const events = [
    ...(audit.error ? [] : audit.data.map((r) => ({ id: `audit-${r.id}`, level: r.level || 'info', message: r.message, timestamp: r.created_at }))),
    ...(payEvents.error
      ? []
      : payEvents.data.map((r) => ({
          id: `pay-${r.event_key}`,
          level: /fail|mismatch|error|invalid|reject/i.test(String(r.outcome || '')) ? 'warning' : 'info',
          message: `Paystack ${r.event}${r.reference ? ` · ${r.reference}` : ''}${r.outcome ? ` · ${r.outcome}` : ''}`,
          timestamp: r.received_at,
        }))),
  ]
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, 12);

  const pay = paystack.config();
  const lastWebhook = payEvents.data?.[0]?.received_at || null;
  const aiConfigured = llm.isConfigured();
  const aiStruggling = ai.available && ai.weekRequests >= 5 && ai.weekErrorRate >= 25;
  const uptimeMin = Math.round(process.uptime() / 60);

  res.json({
    services: [
      { name: 'Backend API', status: 'healthy', latency: null, detail: `Up ${uptimeMin < 60 ? `${uptimeMin} min` : `${Math.round(uptimeMin / 60)} h`}` },
      { name: 'Database', status: ping.error ? 'unavailable' : 'healthy', latency: ping.error ? null : dbLatency, detail: ping.error ? 'Not reachable' : 'Supabase connected' },
      {
        name: 'AI Service',
        status: !aiConfigured ? 'warning' : aiStruggling ? 'warning' : 'healthy',
        latency: ai.available && ai.avgResponseMs != null ? ai.avgResponseMs : null,
        detail: !aiConfigured ? 'No GROQ_API_KEY: rule-based answers only' : aiStruggling ? `${ai.weekErrorRate}% of requests failed this week` : 'Groq connected',
      },
      {
        name: 'Payment Gateway',
        status: pay.enabled ? 'healthy' : 'unavailable',
        latency: null,
        detail: pay.enabled ? `Paystack ${pay.mode} mode${lastWebhook ? ` · last webhook ${saDate(lastWebhook)}` : ''}` : PAY_REASON[pay.reason] || 'Not configured',
      },
    ],
    recentEvents: events,
    aiUsage: ai,
  });
}));

/* ------------------------------- notifications ------------------------------- */

const PAYMENT_TEXT = {
  success: (p) => `Payment received: R${p.amount} ${p.plan} (${p.billingCycle}) from ${p.user}`,
  failed: (p) => `Payment failed: ${p.user} (${p.plan})`,
  mismatch: (p) => `Payment needs review: ${p.reference}`,
  refunded: (p) => `Payment refunded: ${p.reference}`,
};

// GET /admin/notifications  -> what happened in the last 14 days, filtered by this admin's preferences
router.get('/notifications', wrap(async (req, res) => {
  const prefs = prefsOf(req.adminRow);
  const seenAt = req.adminRow.notifications_seen_at ? Date.parse(req.adminRow.notifications_seen_at) : 0;
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const items = [];
  const accounts = await loadAccounts();

  if (prefs.newUser) {
    accounts.forEach((a) => {
      if (a.registeredAt >= since) items.push({ id: `user-${a.id}`, type: 'newUser', text: `New user registered: ${a.name}`, time: a.registeredAt, link: `/users/${a.id}` });
      if (a.business && a.business.createdAt >= since) {
        items.push({ id: `biz-${a.business.id}`, type: 'newUser', text: `New business created: ${a.business.name || 'Unnamed business'}`, time: a.business.createdAt, link: `/users/${a.id}` });
      }
    });
  }
  if (prefs.payment) {
    const rows = ok(await supabase.from('payments').select('*').in('status', Object.keys(PAYMENT_TEXT)).gte('updated_at', since).order('updated_at', { ascending: false }).limit(30));
    const owners = byId(accounts);
    rows.forEach((r) => {
      const p = mapPayment(r, owners);
      items.push({ id: `pay-${r.reference}-${r.status}`, type: 'payment', text: PAYMENT_TEXT[r.status](p), time: r.paid_at || r.updated_at || r.created_at, link: '/subscriptions' });
    });
  }
  // Sponsored adverts waiting for an admin (counted live, so the bell clears as soon as the queue is empty).
  try {
    const q = await require('../lib/sponsored').reviewQueueCounts();
    const parts = [
      q.ads && `${q.ads} advert${q.ads === 1 ? '' : 's'} to review`,
      q.revisions && `${q.revisions} advert change${q.revisions === 1 ? '' : 's'}`,
      q.profiles && `${q.profiles} business page update${q.profiles === 1 ? '' : 's'}`,
      q.reports && `${q.reports} open report${q.reports === 1 ? '' : 's'}`,
    ].filter(Boolean);
    if (parts.length) items.push({ id: `sponsored-queue-${q.latest}`, type: 'payment', text: `Sponsored: ${parts.join(', ')}`, time: q.latest || STARTED_AT, link: '/sponsored' });
  } catch (err) {
    // sponsored.sql not run yet: nothing to show.
  }
  if (prefs.system) {
    const { data } = await supabase.from('admin_audit_log').select('id, level, message, created_at').in('level', ['warning', 'error']).gte('created_at', since).order('created_at', { ascending: false }).limit(20);
    (data || []).forEach((r) => items.push({ id: `audit-${r.id}`, type: 'system', text: r.message, time: r.created_at, link: '/monitoring' }));
    const pay = paystack.config();
    if (!pay.enabled) items.push({ id: 'cfg-payments', type: 'system', text: `Payments are switched off: ${PAY_REASON[pay.reason] || 'not configured'}`, time: STARTED_AT, link: '/monitoring' });
    if (!llm.isConfigured()) items.push({ id: 'cfg-ai', type: 'system', text: 'AI is in rule-based mode: GROQ_API_KEY is not set', time: STARTED_AT, link: '/monitoring' });
  }

  const list = items
    .sort((a, b) => String(b.time).localeCompare(String(a.time)))
    .slice(0, 30)
    .map((n) => ({ ...n, unread: Date.parse(n.time) > seenAt }));
  res.json({ items: list, unread: list.filter((n) => n.unread).length });
}));

// POST /admin/notifications/seen
router.post('/notifications/seen', wrap(async (req, res) => {
  ok(await supabase.from('admin_users').update({ notifications_seen_at: new Date().toISOString() }).eq('user_id', req.admin.id));
  res.json({ ok: true });
}));

/* ----------------------------------- search ----------------------------------- */

// GET /admin/search?q=   -> up to 8 users / businesses for the top-bar search
router.get('/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });
  const hits = filterAccounts(await loadAccounts(), { search: q }).slice(0, 8);
  res.json({ results: hits.map((a) => ({ id: a.id, name: a.name, email: a.email, business: a.business?.name || '', plan: a.subscription.plan })) });
}));

module.exports = router;
