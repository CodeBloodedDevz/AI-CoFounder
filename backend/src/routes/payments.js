const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, notFound, HttpError } = require('../lib/http');
const { hit } = require('../lib/rateLimit');
const paystack = require('../lib/paystack');
const pay = require('../lib/payments');
const adPay = require('../lib/sponsoredPayments');

const router = express.Router();
const REF_RE = /^[A-Za-z0-9.=-]{8,100}$/;

const mine = [requireAuth, requireBusiness];
const limiter = (name, max, windowMs, message) => (req, res, next) => {
  const r = hit(`pay:${name}:${req.user.id}`, max, windowMs);
  if (r.ok) return next();
  res.set('Retry-After', String(r.retryAfterSeconds));
  res.status(429).json({ error: message, code: 'rate_limited' });
};

const publicApiUrl = (req) => (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

// Never cache anything money-related.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// GET /payments/subscription -> the current plan, what it unlocks, and whether payments are switched on.
router.get('/subscription', ...mine, wrap(async (req, res) => {
  const cfg = paystack.config();
  res.json({
    subscription: await pay.getSubscription(req.business.id),
    payments: { enabled: cfg.enabled, mode: cfg.mode, currency: cfg.currency, limitsEnforced: String(process.env.ENFORCE_PLAN_LIMITS || 'true').toLowerCase() !== 'false' },
    payment_history: await pay.listPayments(req.business.id, 10),
  });
}));

// POST /payments/checkout { planId, billingCycle } -> { reference, authorizationUrl, ... }
// The price comes from the server's plan table. Any amount sent by the app is ignored.
router.post('/checkout', ...mine, limiter('checkout', 10, 60_000, 'Too many payment attempts. Please wait a minute.'), wrap(async (req, res) => {
  const { planId, billingCycle } = req.body || {};
  const callbackUrl = process.env.PAYSTACK_CALLBACK_URL || `${publicApiUrl(req)}/payments/return`;
  let result;
  try {
    result = await pay.createCheckout({ business: req.business, user: req.user, planId, billingCycle, callbackUrl });
  } catch (err) {
    if (err instanceof HttpError && err.code) return res.status(err.status).json({ error: err.message, code: err.code });
    throw err;
  }
  const { payment, reused } = result;
  res.json({
    reference: payment.reference,
    authorizationUrl: payment.authorization_url,
    amount: Number(payment.amount) / 100,
    currency: payment.currency,
    mode: payment.mode,
    reused,
  });
}));

// GET /payments/verify/:reference -> asks Paystack, settles, returns the truth.
// The app calls this after the customer comes back from checkout; the redirect itself proves nothing.
router.get('/verify/:reference', ...mine, limiter('verify', 40, 60_000, 'Checking too often. Please wait a moment.'), wrap(async (req, res) => {
  if (!REF_RE.test(req.params.reference)) throw notFound('Payment not found.');
  const payment = await pay.findPayment(req.params.reference, req.business.id); // only YOUR business's payments
  if (!payment) throw notFound('Payment not found.');
  const settled = await pay.verifyAndSettle(payment, { source: 'app' });
  res.json({ payment: pay.paymentDto(settled), subscription: await pay.getSubscription(req.business.id) });
}));

// POST /payments/subscription/cancel | /resume -> the plan keeps working until the paid period ends.
router.post('/subscription/cancel', ...mine, wrap(async (req, res) => {
  res.json({ subscription: await pay.cancelAtPeriodEnd(req.business.id) });
}));
router.post('/subscription/resume', ...mine, wrap(async (req, res) => {
  res.json({ subscription: await pay.resumeSubscription(req.business.id) });
}));

// POST /payments/:reference/cancel -> "I don't want to pay": checks Paystack first (they may have paid), then closes the attempt.
router.post('/:reference/cancel', ...mine, limiter('verify', 40, 60_000, 'Please wait a moment.'), wrap(async (req, res) => {
  if (!REF_RE.test(req.params.reference)) throw notFound('Payment not found.');
  const payment = await pay.findPayment(req.params.reference, req.business.id);
  if (!payment) throw notFound('Payment not found.');
  const settled = await pay.verifyAndSettle(payment, { source: 'app-cancel', returned: true });
  res.json({ payment: pay.paymentDto(settled), subscription: await pay.getSubscription(req.business.id) });
}));

// GET /payments/history
router.get('/history', ...mine, wrap(async (req, res) => {
  res.json({ payments: await pay.listPayments(req.business.id, 20) });
}));

/* ------------------------- where Paystack sends the browser ------------------------- */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// GET /payments/return?reference=... — the customer lands here after the checkout page.
// It verifies with Paystack itself (the URL alone proves nothing) and shows the real result.
router.get('/return', wrap(async (req, res) => {
  const ref = String(req.query.reference || req.query.trxref || '');
  let payment = null;
  let note = '';
  const ip = req.ip || 'unknown';
  if (!REF_RE.test(ref)) note = 'That payment link is not valid.';
  else if (!hit(`pay:return:${ip}`, 30, 60_000).ok) note = 'Too many requests. Please wait a moment and refresh.';
  else {
    try {
      // Advertising payments (Sponsored page) come back to the same page; their references start with "acfad-".
      const found = adPay.isAdReference(ref) ? null : await pay.findPayment(ref);
      const order = found ? null : await adPay.findOrder(ref);
      if (found) payment = pay.paymentDto(await pay.verifyAndSettle(found, { source: 'return', returned: true }));
      else if (order) payment = adPay.orderDto(await adPay.verifyAndSettleOrder(order, { source: 'return', returned: true }));
      else note = "We couldn't find that payment.";
    } catch (err) {
      note = "We couldn't confirm your payment yet. If you paid, don't worry: it will show in the app shortly.";
    }
  }
  const status = payment?.status;
  const title = status === 'success' ? 'Payment confirmed' : status === 'pending' ? 'Payment processing' : payment ? 'Payment not completed' : 'Payment';
  const text = payment ? payment.message : note;
  const appUrl = process.env.APP_URL ? esc(process.env.APP_URL) : '';
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#faf8fc;color:#241f31;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.c{background:#fff;border-radius:18px;padding:28px;max-width:380px;margin:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center}
h1{font-size:20px;margin:0 0 10px}p{color:#5b5470;line-height:1.5;margin:8px 0}a{display:inline-block;margin-top:14px;background:#ff5773;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700}
small{color:#8a84a0;display:block;margin-top:14px}</style></head><body><div class="c"><h1>${esc(title)}</h1><p>${esc(text)}</p>
${appUrl ? `<a href="${appUrl}">Return to the app</a>` : '<p>You can close this page and go back to the app. It updates by itself.</p>'}
${payment ? `<small>Reference ${esc(payment.reference)}${payment.mode === 'test' ? ' · test mode' : ''}</small>` : ''}</div></body></html>`);
}));

/* ------------------------------------ webhook ------------------------------------ */

// POST /payments/webhook — Paystack tells us about payments. Mounted in server.js BEFORE the
// JSON parser, because the signature is computed over the exact raw bytes.
//   - signature checked in constant time (HMAC-SHA512 with the secret key)
//   - every event is recorded once; a repeat delivery is acknowledged and ignored
//   - we never trust the body: a "charge.success" makes us ask Paystack, then validate amount/currency/plan
async function webhook(req, res) {
  const cfg = paystack.config();
  if (!cfg.enabled) return res.status(503).json({ error: 'Payments are not set up.' });

  const raw = req.body;
  if (!Buffer.isBuffer(raw) || !paystack.verifySignature(raw, req.get('x-paystack-signature'))) {
    console.warn(`[payments] webhook REJECTED: bad or missing signature (ip ${req.ip})`);
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON.' });
  }
  const name = String(event?.event || '');
  const data = event?.data && typeof event.data === 'object' ? event.data : {};
  const reference = String(data.reference || data.transaction_reference || '');
  const eventKey = `${name}:${data.id ?? reference ?? ''}`.slice(0, 200);
  if (!name || eventKey.endsWith(':')) return res.status(400).json({ error: 'Unrecognised event.' });

  try {
    // First delivery wins; the primary key turns a repeat into a harmless no-op.
    const ins = await supabase.from('payment_events').insert({ event_key: eventKey, event: name, reference: reference || null });
    if (ins.error) {
      if (ins.error.code === '23505') {
        console.log(`[payments] webhook duplicate ignored: ${eventKey}`);
        return res.status(200).json({ received: true, duplicate: true });
      }
      throw new Error(ins.error.message);
    }

    let outcome = 'ignored';
    try {
      if (name === 'charge.success' && REF_RE.test(reference)) {
        const payment = adPay.isAdReference(reference) ? null : await pay.findPayment(reference);
        const order = payment ? null : await adPay.findOrder(reference); // an advertising package (Sponsored page)
        if (payment) outcome = (await pay.verifyAndSettle(payment, { source: 'webhook' })).status;
        else if (order) outcome = `ad:${(await adPay.verifyAndSettleOrder(order, { source: 'webhook' })).status}`;
        else outcome = 'unknown_reference'; // not one of ours (e.g. another app sharing the Paystack account)
      } else if (name === 'refund.processed' && REF_RE.test(String(data.transaction_reference || reference))) {
        const ref = String(data.transaction_reference || reference);
        outcome = adPay.isAdReference(ref) ? `ad:${await adPay.handleOrderRefund(ref)}` : await pay.handleRefund(ref);
      }
    } catch (err) {
      // Let Paystack retry: forget we saw this event so the retry is processed.
      await supabase.from('payment_events').delete().eq('event_key', eventKey);
      console.error(`[payments] webhook processing failed for ${eventKey}: ${err.message}`);
      return res.status(500).json({ error: 'Could not process the event yet.' });
    }
    await supabase.from('payment_events').update({ outcome, processed_at: new Date().toISOString() }).eq('event_key', eventKey);
    console.log(`[payments] webhook ${eventKey} -> ${outcome}`);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[payments] webhook error for ${eventKey}: ${err.message}`);
    return res.status(500).json({ error: 'Could not record the event.' });
  }
}

module.exports = router;
module.exports.webhook = webhook;
