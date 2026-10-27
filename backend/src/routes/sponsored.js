// The Sponsored page's API for the app. Everyone who is logged in can browse adverts and business pages;
// the /me routes manage the caller's OWN business's adverts and nothing else (every query is filtered by
// req.business.id, which comes from the verified login, never from the request).

const express = require('express');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { loadSubscription } = require('../middleware/plan');
const { wrap, notFound, HttpError } = require('../lib/http');
const { hit } = require('../lib/rateLimit');
const paystack = require('../lib/paystack');
const { getSubscription } = require('../lib/payments');
const { entitlementsFor } = require('../lib/plans');
const rules = require('../lib/sponsoredRules');
const sponsored = require('../lib/sponsored');
const sponsoredPay = require('../lib/sponsoredPayments');
const { uploadImage } = require('../lib/sponsoredMedia');

const router = express.Router();
const REF_RE = /^[A-Za-z0-9.=-]{8,100}$/;

router.use(requireAuth);

const limiter = (name, max, windowMs, message) => (req, res, next) => {
  const r = hit(`sponsored:${name}:${req.user.id}`, max, windowMs);
  if (r.ok) return next();
  res.set('Retry-After', String(r.retryAfterSeconds));
  res.status(429).json({ error: message, code: 'rate_limited' });
};
const mine = [requireBusiness, loadSubscription];
const callbackUrl = (req) => process.env.PAYSTACK_CALLBACK_URL || `${(process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '')}/payments/return`;

// Errors with a machine-readable code (upgrade_required, included_used, profile_incomplete, ...) keep it, so
// the app can show the right next step.
const withCode = (fn) => wrap(async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof HttpError && err.code) return res.status(err.status).json({ error: err.message, code: err.code });
    throw err;
  }
});

/* ----------------------------------- browsing (everyone) ----------------------------------- */

// GET /sponsored/meta -> categories, packages and what this person's plan allows
router.get('/meta', withCode(async (req, res) => {
  let subscription = { planId: 'free', entitlements: entitlementsFor('free') };
  if (req.business) subscription = await getSubscription(req.business.id).catch(() => subscription);
  const packages = (await sponsored.listPackages()).map(sponsored.packageDto);
  const cfg = paystack.config();
  res.json({
    categories: rules.CATEGORIES,
    packages: packages.filter((p) => !p.included),
    includedPackage: packages.find((p) => p.included) || null,
    eligibility: { hasBusiness: Boolean(req.business), ...(await sponsored.eligibility(req.business, subscription)) },
    payments: { enabled: cfg.enabled, mode: cfg.mode, currency: cfg.currency },
    limits: rules.LIMITS,
  });
}));

// GET /sponsored/ads?category=&q=&seed=&page= -> { featured, ads, page, totalPages, total, categories }
router.get('/ads', withCode(async (req, res) => {
  const category = rules.isCategory(String(req.query.category || '')) ? String(req.query.category) : null;
  res.json(await sponsored.browse({ category, q: req.query.q, seed: req.query.seed, page: req.query.page, limit: req.query.limit }));
}));

// GET /sponsored/ads/:id -> the advert and its business page ("Learn More")
router.get('/ads/:id', withCode(async (req, res) => {
  res.json(await sponsored.publicAd(req.params.id, req.user));
}));

// POST /sponsored/events { events: [{ adId, type }] } -> views and taps (counted once per person per day)
router.post('/events', limiter('events', 240, 60_000, 'Too many requests.'), withCode(async (req, res) => {
  res.json(await sponsored.recordEvents(req.user, req.body?.events));
}));

// POST /sponsored/ads/:id/report { reason, details }
router.post('/ads/:id/report', limiter('report', 10, 60 * 60_000, 'You have sent a lot of reports. Please try again later.'), withCode(async (req, res) => {
  res.json(await sponsored.reportAd(req.user, req.params.id, { reason: req.body?.reason, details: req.body?.details }));
}));

/* ----------------------------------- the business page (owner) ----------------------------------- */

// GET /sponsored/me/profile -> the page as published, being edited, and suggestions from the business's records
router.get('/me/profile', ...mine, withCode(async (req, res) => {
  const [row, prefill] = await Promise.all([sponsored.getProfileRow(req.business.id), sponsored.prefillFor(req.business)]);
  res.json({ profile: sponsored.profileView(row), prefill });
}));

// PUT /sponsored/me/profile { displayName, about, logoUrl, ... } -> saved as a draft (reviewed with the next advert)
router.put('/me/profile', ...mine, limiter('profile', 60, 60 * 60_000, 'Too many changes. Please wait a moment.'), withCode(async (req, res) => {
  res.json({ profile: await sponsored.saveProfile(req.business, req.body) });
}));

// POST /sponsored/me/media { data: base64 } -> { url }  (PNG / JPEG / WebP, at most 2 MB)
router.post('/me/media', ...mine, limiter('media', 40, 60 * 60_000, 'Too many pictures uploaded. Please try again later.'), withCode(async (req, res) => {
  res.json(await uploadImage(req.business.id, req.body?.data));
}));

/* ----------------------------------- adverts (owner) ----------------------------------- */

// GET /sponsored/me/ads -> every advert of this business with its payment and statistics
router.get('/me/ads', ...mine, withCode(async (req, res) => {
  res.json({ ads: await sponsored.listMyAds(req.business.id), eligibility: await sponsored.eligibility(req.business, req.subscription) });
}));

// GET /sponsored/me/ads/:id -> one advert, its 30-day statistics and history
router.get('/me/ads/:id', ...mine, withCode(async (req, res) => {
  res.json(await sponsored.myAd(req.business.id, req.params.id));
}));

// GET /sponsored/me/ads/:id/stats?days=30
router.get('/me/ads/:id/stats', ...mine, withCode(async (req, res) => {
  const ad = await sponsored.ownAd(req.business.id, req.params.id);
  res.json(await sponsored.adStats(ad, req.query.days));
}));

// POST /sponsored/me/ads { title, description, imageUrl, category, packageId | useIncluded:true }
//   -> { ad, checkout: { reference, authorizationUrl, ... } | null }
router.post('/me/ads', ...mine, limiter('create', 15, 60 * 60_000, 'Too many adverts created. Please try again later.'), withCode(async (req, res) => {
  res.json(await sponsored.createAd({ business: req.business, user: req.user, subscription: req.subscription, body: req.body, callbackUrl: callbackUrl(req) }));
}));

// PUT /sponsored/me/ads/:id { title?, description?, imageUrl?, category?, resubmit? }
router.put('/me/ads/:id', ...mine, limiter('edit', 60, 60 * 60_000, 'Too many changes. Please wait a moment.'), withCode(async (req, res) => {
  res.json({ ad: await sponsored.editAd(req.business, req.user, req.params.id, req.body) });
}));

// POST /sponsored/me/ads/:id/checkout -> pay for an advert that is waiting for payment
router.post('/me/ads/:id/checkout', ...mine, limiter('checkout', 10, 60_000, 'Too many payment attempts. Please wait a minute.'), withCode(async (req, res) => {
  res.json(await sponsored.checkoutAd({ business: req.business, user: req.user, adId: req.params.id, callbackUrl: callbackUrl(req) }));
}));

// POST /sponsored/me/ads/:id/withdraw -> cancel an advert that isn't live yet
router.post('/me/ads/:id/withdraw', ...mine, withCode(async (req, res) => {
  res.json(await sponsored.withdrawAd(req.business, req.user, req.params.id));
}));

// POST /sponsored/me/ads/:id/renew { packageId | useIncluded:true }
router.post('/me/ads/:id/renew', ...mine, limiter('create', 15, 60 * 60_000, 'Too many adverts created. Please try again later.'), withCode(async (req, res) => {
  res.json(await sponsored.renewAd({ business: req.business, user: req.user, subscription: req.subscription, adId: req.params.id, body: req.body, callbackUrl: callbackUrl(req) }));
}));

/* ----------------------------------- advert payments (owner) ----------------------------------- */

// GET /sponsored/me/orders/:reference/verify -> asks Paystack and settles (the redirect proves nothing)
router.get('/me/orders/:reference/verify', ...mine, limiter('verify', 40, 60_000, 'Checking too often. Please wait a moment.'), withCode(async (req, res) => {
  if (!REF_RE.test(req.params.reference)) throw notFound('Payment not found.');
  const order = await sponsoredPay.findOrder(req.params.reference, req.business.id);
  if (!order) throw notFound('Payment not found.');
  const settled = await sponsoredPay.verifyAndSettleOrder(order, { source: 'app' });
  res.json({ payment: sponsoredPay.orderDto(settled), ad: sponsored.ownerAdDto(await sponsored.ownAd(req.business.id, settled.ad_id)) });
}));

// POST /sponsored/me/orders/:reference/cancel -> "I don't want to pay": checks Paystack first, then closes it
router.post('/me/orders/:reference/cancel', ...mine, limiter('verify', 40, 60_000, 'Please wait a moment.'), withCode(async (req, res) => {
  if (!REF_RE.test(req.params.reference)) throw notFound('Payment not found.');
  const order = await sponsoredPay.findOrder(req.params.reference, req.business.id);
  if (!order) throw notFound('Payment not found.');
  const settled = await sponsoredPay.verifyAndSettleOrder(order, { source: 'app-cancel', returned: true });
  res.json({ payment: sponsoredPay.orderDto(settled), ad: sponsored.ownerAdDto(await sponsored.ownAd(req.business.id, settled.ad_id)) });
}));

router.use((req, res) => res.status(404).json({ error: 'Not found.' }));

module.exports = router;
