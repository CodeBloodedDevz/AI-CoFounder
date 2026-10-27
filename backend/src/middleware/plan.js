// Plan limits, enforced on the server from the VERIFIED subscription in the database.
// The app can show or hide things, but it can't unlock anything: these checks run on every request.

const { getSubscription } = require('../lib/payments');
const { REQUIRED_PLAN, PLANS, entitlementsFor } = require('../lib/plans');
const { todayInSA } = require('../lib/http');

const enforced = () => String(process.env.ENFORCE_PLAN_LIMITS || 'true').toLowerCase() !== 'false';

/** Attaches req.subscription (never throws: if the lookup fails the person is treated as Free). */
async function loadSubscription(req, res, next) {
  try {
    req.subscription = await getSubscription(req.business.id);
  } catch (err) {
    console.error('[plan] subscription lookup failed, treating as Free:', err.message);
    req.subscription = { planId: 'free', plan: 'Free', entitlements: entitlementsFor('free') };
  }
  next();
}

/** 402 unless the person's verified plan includes `feature`. */
const requireFeature = (feature) => (req, res, next) => {
  if (!enforced() || req.subscription?.entitlements?.[feature]) return next();
  const needed = REQUIRED_PLAN[feature] || 'pro';
  res.status(402).json({ error: `This is part of the ${PLANS[needed].name} plan. Upgrade in More > Subscription to use it.`, code: 'upgrade_required', feature, requiredPlan: needed });
};

// Free-plan daily AI message allowance (kept in memory: a restart gives a fresh allowance, never a smaller one).
const used = new Map();
function takeAiMessage(req) {
  const limit = req.subscription?.entitlements?.aiMessagesPerDay;
  if (!enforced() || limit === null || limit === undefined) return { allowed: true };
  const day = todayInSA();
  const key = `${req.business.id}|${day}`;
  const n = used.get(key) || 0;
  if (n >= limit) return { allowed: false, limit };
  used.set(key, n + 1);
  if (used.size > 5000) for (const k of used.keys()) if (!k.endsWith(day)) used.delete(k);
  return { allowed: true, remaining: limit - n - 1 };
}
const resetUsage = () => used.clear();

module.exports = { loadSubscription, requireFeature, takeAiMessage, resetUsage };
