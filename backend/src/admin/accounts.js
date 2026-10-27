// Everyone who uses the app, as the admin portal lists them: one entry per Supabase Auth user, joined
// with their business (the same "first business by created_at" the app's login middleware picks) and
// their subscription as the app sees it (lib/payments.subscriptionView, so expired plans count as Free).
// Built from real rows only; cached for 15 seconds because a dashboard asks several times at once.

const supabase = require('../supabaseClient');
const { HttpError, ok } = require('../lib/http');
const { subscriptionView } = require('../lib/payments');
const { isSuspended } = require('../middleware/auth');
const { normalizeCurrency } = require('../lib/currency');
const { todayInSA } = require('../lib/http');

const CACHE_MS = 15_000;
let cache = null;

/** Supabase returns at most 1000 rows per request: this reads every page. `build` makes a fresh query. */
async function fetchAll(build) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const data = ok(await build().range(from, from + 999));
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function listAuthUsers() {
  const users = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error('[admin] listUsers failed:', error.message);
      throw new HttpError(503, 'Could not load users from Supabase Auth. Please try again.');
    }
    users.push(...(data?.users || []));
    if ((data?.users || []).length < 1000) break;
  }
  return users;
}

const displayName = (u) => {
  const m = u?.user_metadata || {};
  return String(m.full_name || m.name || (u?.email || '').split('@')[0] || 'Unnamed user').trim();
};

/** "South African Rand (R)" -> "R" (falls back to "R"). */
const currencySymbol = (label) => {
  const m = String(label || '').match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : 'R';
};

function toBusinessSummary(b) {
  if (!b) return null;
  const currency = normalizeCurrency(b.currency);
  return {
    id: b.id,
    name: b.name || '',
    type: b.type || '',
    businessModel: b.business_model || '',
    currency: currency || '',
    currencySymbol: currencySymbol(currency),
    location: b.location || '',
    createdAt: b.created_at,
  };
}

async function loadAccounts({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.accounts;

  const [users, businesses, subscriptions, admins] = await Promise.all([
    listAuthUsers(),
    fetchAll(() => supabase.from('businesses').select('id, owner_id, name, type, business_model, currency, location, created_at').order('created_at', { ascending: true }).order('id')),
    fetchAll(() => supabase.from('subscriptions').select('*').order('business_id')),
    fetchAll(() => supabase.from('admin_users').select('user_id, is_active').order('user_id')),
  ]);

  const businessByOwner = new Map();
  for (const b of businesses) if (!businessByOwner.has(b.owner_id)) businessByOwner.set(b.owner_id, b);
  const subByBusiness = new Map(subscriptions.map((s) => [s.business_id, s]));
  const adminIds = new Set(admins.map((a) => a.user_id));
  const today = todayInSA();

  const accounts = users
    .map((u) => {
      const b = businessByOwner.get(u.id) || null;
      const suspended = isSuspended(u);
      return {
        id: u.id,
        name: displayName(u),
        email: u.email || '',
        phone: u.user_metadata?.phone || u.phone || '',
        registeredAt: u.created_at,
        lastSignInAt: u.last_sign_in_at || null,
        emailConfirmed: Boolean(u.email_confirmed_at),
        status: suspended ? 'suspended' : 'active',
        suspendedUntil: suspended ? u.banned_until : null,
        isAdmin: adminIds.has(u.id),
        business: toBusinessSummary(b),
        subscription: subscriptionView(b ? subByBusiness.get(b.id) || null : null, today),
      };
    })
    // Admin-only accounts (an admin who doesn't run a business in the app) are not app users.
    .filter((a) => !(a.isAdmin && !a.business))
    .sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt)));

  cache = { at: Date.now(), accounts };
  return accounts;
}

const forgetAccounts = () => {
  cache = null;
};

async function findAccount(id) {
  return (await loadAccounts()).find((a) => a.id === id) || null;
}

/** search (name / email / business), plan (free|pro|premium) and status (active|suspended) filters. */
function filterAccounts(accounts, { search, plan, status, subscriptionStatus } = {}) {
  const q = String(search || '').trim().toLowerCase();
  return accounts.filter(
    (a) =>
      (!q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || (a.business?.name || '').toLowerCase().includes(q)) &&
      (!plan || a.subscription.planId === plan) &&
      (!status || a.status === status) &&
      (!subscriptionStatus || subscriptionStatusOf(a) === subscriptionStatus)
  );
}

/** One word for the Subscriptions table: active | cancelling | expired | free. */
function subscriptionStatusOf(a) {
  const s = a.subscription;
  if (s.planId !== 'free') return s.cancelAtPeriodEnd ? 'cancelling' : 'active';
  return s.status === 'expired' ? 'expired' : 'free';
}

module.exports = { fetchAll, listAuthUsers, loadAccounts, forgetAccounts, findAccount, filterAccounts, subscriptionStatusOf, displayName, currencySymbol, toBusinessSummary };
