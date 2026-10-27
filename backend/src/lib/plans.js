// What each plan costs and what it unlocks. THE SERVER IS THE ONLY SOURCE OF
// TRUTH for prices: a checkout never trusts an amount sent by the app.
// (The app shows the same prices; src/lib/plansParity.test.js keeps them equal.)

const PLANS = {
  free: { id: 'free', name: 'Free', rank: 0, priceMonthly: 0, priceAnnual: 0 },
  pro: { id: 'pro', name: 'Pro', rank: 1, priceMonthly: 99, priceAnnual: 950 },
  premium: { id: 'premium', name: 'Premium', rank: 2, priceMonthly: 249, priceAnnual: 2390 },
};
const CYCLES = ['monthly', 'annual'];

// null = no limit. Plan limits are enforced on the server (middleware/plan.js).
// Advertising on the Sponsored page (lib/sponsored.js): everyone may BROWSE adverts on every plan.
//   adPurchase          may buy advertising packages (Starter / Growth / Premium Campaign)
//   adsIncludedPerMonth standard adverts included at no extra cost, per South African calendar month
//                       (the database allows at most 1, see sponsored_orders_one_included_per_month)
const ENTITLEMENTS = {
  free: { aiMessagesPerDay: 20, pricingAssistant: false, restockPlan: false, retentionInsights: false, growthInsights: false, multiBusiness: false, adPurchase: false, adsIncludedPerMonth: 0 },
  pro: { aiMessagesPerDay: null, pricingAssistant: true, restockPlan: true, retentionInsights: false, growthInsights: false, multiBusiness: false, adPurchase: true, adsIncludedPerMonth: 0 },
  premium: { aiMessagesPerDay: null, pricingAssistant: true, restockPlan: true, retentionInsights: true, growthInsights: true, multiBusiness: true, adPurchase: true, adsIncludedPerMonth: 1 },
};
// The cheapest plan that includes a feature (for "upgrade to X" messages).
const REQUIRED_PLAN = { pricingAssistant: 'pro', restockPlan: 'pro', retentionInsights: 'premium', growthInsights: 'premium', multiBusiness: 'premium', adPurchase: 'pro', adsIncludedPerMonth: 'premium' };

const isPaidPlan = (id) => id === 'pro' || id === 'premium';
const isCycle = (c) => CYCLES.includes(c);
const rank = (id) => PLANS[id]?.rank ?? 0;
const entitlementsFor = (id) => ({ ...(ENTITLEMENTS[id] || ENTITLEMENTS.free) });

/** Price in whole rand. */
function priceOf(planId, cycle) {
  const p = PLANS[planId];
  if (!p || !isCycle(cycle)) return null;
  return cycle === 'annual' ? p.priceAnnual : p.priceMonthly;
}
/** Price in the smallest currency unit (cents), which is what Paystack wants. */
const priceInCents = (planId, cycle) => {
  const rand = priceOf(planId, cycle);
  return rand === null ? null : Math.round(rand * 100);
};

/** "2026-01-31" + monthly -> "2026-02-28" (never spills into the next month). */
function addPeriod(isoDate, cycle) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const months = cycle === 'annual' ? 12 : 1;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const daysBetween = (fromIso, toIso) => Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

module.exports = { PLANS, CYCLES, ENTITLEMENTS, REQUIRED_PLAN, isPaidPlan, isCycle, rank, entitlementsFor, priceOf, priceInCents, addPeriod, daysBetween };
