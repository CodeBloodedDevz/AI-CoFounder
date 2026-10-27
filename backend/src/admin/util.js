// Small helpers for the admin routes. Dates use South African time, like the rest of the backend
// (lib/http.todayInSA), so "today" and "this month" mean the same thing in the app and the portal.

const supabase = require('../supabaseClient');
const { ok, todayInSA } = require('../lib/http');
const { paymentDto } = require('../lib/payments');
const paystack = require('../lib/paystack');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** ISO timestamp -> "YYYY-MM-DD" in South Africa (null for blanks / bad values). */
function saDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

/** "YYYY-MM-DD" or null (anything else is ignored). */
const readDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

const within = (value, from, to) => {
  const day = saDate(value);
  if (!day) return !from && !to;
  return (!from || day >= from) && (!to || day <= to);
};

/** Start of a South African day as an ISO instant (SA is UTC+2 all year). */
const saDayStartIso = (ymd) => `${ymd}T00:00:00+02:00`;
const saDayEndIso = (ymd) => `${ymd}T23:59:59.999+02:00`;

function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMonths(ymd, n) {
  const [y, m] = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
const monthStart = (ymd) => `${ymd.slice(0, 7)}-01`;
const monthLabel = (ymd) => `${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(2, 4)}`;
const dayLabel = (ymd) => DAYS[new Date(`${ymd}T12:00:00Z`).getUTCDay()];

/** Every month from `from` to `to` as [{ key: 'YYYY-MM', label: 'Nov 25' }] (at most 36). */
function monthsBetween(from, to) {
  const out = [];
  for (let m = monthStart(from); m <= to && out.length < 36; m = addMonths(m, 1)) out.push({ key: m.slice(0, 7), label: monthLabel(m) });
  return out;
}

/** % change, or null when there is nothing to compare with. */
const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

function readPaging(query, defaultLimit = 8) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, from: (page - 1) * limit };
}
const pageOf = (key, list, page, limit) => ({
  [key]: list.slice((page - 1) * limit, page * limit),
  total: list.length,
  page,
  totalPages: Math.max(1, Math.ceil(list.length / limit)),
});
const pageResult = (key, rows, total, page, limit) => ({ [key]: rows, total: total || 0, page, totalPages: Math.max(1, Math.ceil((total || 0) / limit)) });

/** Text safe to put inside a PostgREST or() / ilike filter. */
const cleanSearch = (v) => String(v || '').replace(/[,()*%\\"':]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);

/** Payments count as revenue in the mode the server takes payments in (test while testing, live after). */
const revenueMode = () => paystack.config().mode || 'live';

async function countRows(table, build = (q) => q) {
  const result = await build(supabase.from(table).select('*', { count: 'exact', head: true }));
  ok(result);
  return result.count || 0;
}

/** One payment row as the portal shows it (paymentDto is the app's own shape: rand, plan name, status). */
function mapPayment(row, accountsById = new Map()) {
  const dto = paymentDto(row);
  const a = accountsById.get(row.user_id);
  return {
    ...dto,
    id: row.reference,
    userId: row.user_id,
    user: a?.name || row.email || 'Unknown user',
    email: row.email || a?.email || '',
    business: a?.business?.name || '',
    date: saDate(row.paid_at || row.created_at),
    failureReason: row.failure_reason || null,
  };
}

function mapUser(a) {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    registeredAt: saDate(a.registeredAt),
    lastSignInAt: a.lastSignInAt,
    business: a.business?.name || '—',
    businessId: a.business?.id || null,
    businessType: a.business?.type || '',
    plan: a.subscription.plan,
    planId: a.subscription.planId,
    status: a.status,
    isAdmin: a.isAdmin,
  };
}

const isTableMissing = (error) => Boolean(error && (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|could not find the table/i.test(error.message || '')));

module.exports = {
  saDate, readDate, within, saDayStartIso, saDayEndIso, addDays, addMonths, monthStart, monthLabel, dayLabel, monthsBetween,
  pct, readPaging, pageOf, pageResult, cleanSearch, revenueMode, countRows, mapPayment, mapUser, isTableMissing, todayInSA,
};
