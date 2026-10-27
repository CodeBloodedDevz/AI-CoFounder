// Paying for an advertising package. Same golden rule as subscriptions (lib/payments.js): an advert is only
// ever moved forward by settleOrder(), and settleOrder() only does that after Paystack's own verify API has
// confirmed — for THIS reference — a successful payment of the exact amount and currency stored on the order,
// for this advert and package. Nothing the app, the browser redirect or a webhook body says is trusted alone.
//
// Orders live in sponsored_orders (not in payments, which only ever activates subscription plans). Their
// references start with "acfad-", and the shared Paystack webhook / return page (routes/payments.js) hand
// those to this file.

const crypto = require('node:crypto');
const supabase = require('../supabaseClient');
const paystack = require('./paystack');
const { HttpError, ok } = require('./http');

const PREFIX = 'acfad-';
const PENDING_REUSE_MS = 30 * 60_000;
const EXPIRY_MS = () => (Number(process.env.PAYMENT_EXPIRY_MINUTES) > 0 ? Number(process.env.PAYMENT_EXPIRY_MINUTES) : 60) * 60_000;
const T = 'sponsored_orders';

const log = (level, msg, extra = {}) => console[level === 'info' ? 'log' : level](`[sponsored-pay] ${msg}`, Object.keys(extra).length ? JSON.stringify(extra) : '');
const ads = () => require('./sponsored'); // loaded when used (sponsored.js also loads this file)

const isAdReference = (ref) => String(ref || '').startsWith(PREFIX);
const newReference = () => `${PREFIX}${Date.now().toString(36)}-${crypto.randomBytes(9).toString('hex')}`;

const STATUS_MESSAGES = {
  pending: 'Waiting for your payment to be confirmed.',
  success: 'Payment confirmed. Your advert is now waiting for approval.',
  failed: 'The payment was not successful, so you have not been charged. You can try again from My adverts.',
  cancelled: 'The payment was cancelled before it was completed. You can try again from My adverts.',
  expired: 'This payment session expired. You can start again from My adverts.',
  mismatch: "We couldn't match this payment to your advert. Please contact support with your reference.",
  refunded: 'This payment was refunded.',
};

function orderDto(o) {
  if (!o) return null;
  return {
    reference: o.reference,
    adId: o.ad_id,
    packageId: o.package_id,
    kind: o.kind,
    amount: Number(o.amount) / 100,
    currency: o.currency,
    status: o.status,
    message: STATUS_MESSAGES[o.status] || '',
    mode: o.mode,
    channel: o.channel || null,
    refundStatus: o.refund_status,
    createdAt: o.created_at,
    paidAt: o.paid_at || null,
  };
}

async function findOrder(reference, businessId) {
  let q = supabase.from(T).select('*').eq('reference', String(reference));
  if (businessId) q = q.eq('business_id', businessId);
  return ok(await q.maybeSingle());
}

/* -------------------------------- checkout -------------------------------- */

/** Records a pending order for the advert (price from the package on the server) and opens Paystack checkout. */
async function createCheckout({ ad, pkg, business, user, callbackUrl }) {
  const cfg = paystack.config();
  if (!cfg.enabled) throw new HttpError(503, 'Payments are not available right now. Your advert is saved: pay for it later from My adverts.');
  if (!user.email) throw new HttpError(400, 'Your account has no email address, which payments need.');
  const amount = Math.round(Number(pkg.price_cents));
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'This package has no price.');

  // Double taps and retries reuse the same open checkout, so nobody is charged twice.
  const open = ok(await supabase.from(T).select('*').eq('ad_id', ad.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(5)).find(
    (o) => Number(o.amount) === amount && o.currency === cfg.currency && o.mode === cfg.mode && o.authorization_url &&
      Date.now() - Date.parse(o.created_at) < PENDING_REUSE_MS && Date.parse(o.expires_at) > Date.now()
  );
  if (open) return { order: open, reused: true };

  const reference = newReference();
  const order = ok(await supabase.from(T).insert({
    ad_id: ad.id,
    business_id: business.id,
    user_id: user.id,
    email: String(user.email).toLowerCase(),
    kind: 'paid',
    package_id: pkg.id,
    reference,
    amount,
    currency: cfg.currency,
    status: 'pending',
    mode: cfg.mode,
    expires_at: new Date(Date.now() + EXPIRY_MS()).toISOString(),
  }).select().single());

  try {
    const init = await paystack.initializeTransaction({
      email: order.email,
      amount,
      currency: cfg.currency,
      reference,
      callbackUrl,
      metadata: { kind: 'sponsored_ad', order_id: order.id, ad_id: ad.id, package_id: pkg.id, business_id: business.id },
    });
    if (!init?.authorization_url || init.reference !== reference) throw new paystack.PaystackError('Paystack returned an unexpected checkout.', { code: 'bad_response' });
    const updated = ok(await supabase.from(T).update({ authorization_url: init.authorization_url, access_code: init.access_code || null, updated_at: new Date().toISOString() }).eq('id', order.id).select().single());
    log('info', 'checkout started', { reference, package: pkg.id, mode: cfg.mode });
    return { order: updated, reused: false };
  } catch (err) {
    await supabase.from(T).update({ status: 'failed', failure_reason: `init_failed: ${err.message}`.slice(0, 300), updated_at: new Date().toISOString() }).eq('id', order.id);
    log('error', 'initialize failed', { reference, code: err.code, message: err.message });
    throw new HttpError(502, "We couldn't start the payment with Paystack. You have not been charged. Your advert is saved: try paying again from My adverts.");
  }
}

/* -------------------------------- settling -------------------------------- */

/** What a Paystack transaction means for OUR stored order. -> { status, reason } */
function judgeOrder(order, tx, { returned = false } = {}) {
  const gateway = String(tx?.status || '').toLowerCase();
  if (gateway === 'success') {
    const problems = [];
    if (tx.reference !== order.reference) problems.push('reference differs');
    if (Number(tx.amount) !== Number(order.amount)) problems.push(`amount ${tx.amount} != expected ${order.amount}`);
    if (String(tx.currency || '').toUpperCase() !== String(order.currency).toUpperCase()) problems.push(`currency ${tx.currency} != expected ${order.currency}`);
    const meta = tx.metadata && typeof tx.metadata === 'object' ? tx.metadata : {};
    if (meta.order_id !== order.id || meta.ad_id !== order.ad_id || meta.package_id !== order.package_id) problems.push('advert metadata differs');
    const email = String(tx.customer?.email || '').toLowerCase();
    if (order.email && email && email !== order.email) problems.push('customer email differs');
    return problems.length ? { status: 'mismatch', reason: problems.join('; ') } : { status: 'success' };
  }
  if (gateway === 'failed') return { status: 'failed', reason: String(tx.gateway_response || 'declined').slice(0, 200) };
  if (gateway === 'reversed') return { status: 'failed', reason: 'reversed' };
  if (gateway === 'abandoned' && returned) return { status: 'cancelled', reason: 'abandoned' };
  return { status: 'pending' };
}

/** A verified payment: the advert moves from "awaiting payment" to the review queue. */
async function attachToAd(order) {
  const ad = ok(await supabase.from('sponsored_ads').select('id, status, business_id').eq('id', order.ad_id).maybeSingle());
  if (!ad) throw new Error('advert not found');
  if (ad.status === 'awaiting_payment') {
    await ads().sendToReview(ad.id, ad.business_id, `Paid ${order.currency} ${(Number(order.amount) / 100).toFixed(2)} (${order.reference})`);
  } else if (['withdrawn', 'removed'].includes(ad.status)) {
    // Paid after the advert was withdrawn / removed (e.g. a second tab): flag it so an admin refunds it.
    await supabase.from(T).update({ refund_status: 'requested', updated_at: new Date().toISOString() }).eq('id', order.id).eq('refund_status', 'none');
    await ads().logAd(ad.id, { action: 'paid_after_close', note: `Refund needed for ${order.reference}` });
    log('warn', 'payment arrived for a closed advert - refund needed', { reference: order.reference });
  }
  // Already in review / approved (paid twice): the extra payment is flagged for a refund.
  else if (ok(await supabase.from(T).select('id').eq('ad_id', ad.id).eq('status', 'success').neq('id', order.id)).length) {
    await supabase.from(T).update({ refund_status: 'requested', updated_at: new Date().toISOString() }).eq('id', order.id).eq('refund_status', 'none');
    log('warn', 'second payment for the same advert - refund needed', { reference: order.reference });
  }
}

async function settleOrder(order, tx, { source = 'verify', returned = false } = {}) {
  if (order.applied_at) return order;
  const verdict = judgeOrder(order, tx, { returned });
  const now = new Date().toISOString();

  if (verdict.status !== 'success') {
    let status = verdict.status;
    if (status === 'pending' && Date.parse(order.expires_at) < Date.now()) status = 'expired';
    if (status === 'mismatch') log('error', 'PAYMENT MISMATCH - advert NOT moved forward', { reference: order.reference, source, reason: verdict.reason });
    const rows = ok(await supabase.from(T).update({
      status,
      failure_reason: verdict.reason || null,
      gateway_response: tx?.gateway_response ? String(tx.gateway_response).slice(0, 200) : null,
      verified_at: now,
      updated_at: now,
    }).eq('id', order.id).is('applied_at', null).select());
    return rows[0] || (await findOrder(order.reference));
  }

  // Verified success: only one caller can flip applied_at from null.
  const claimed = ok(await supabase.from(T).update({
    status: 'success',
    applied_at: now,
    verified_at: now,
    paid_at: tx.paid_at || now,
    paystack_id: tx.id ?? null,
    channel: tx.channel || null,
    gateway_response: tx.gateway_response ? String(tx.gateway_response).slice(0, 200) : null,
    failure_reason: null,
    updated_at: now,
  }).eq('id', order.id).is('applied_at', null).select());
  if (!claimed.length) return findOrder(order.reference);

  try {
    await attachToAd(claimed[0]);
  } catch (err) {
    await supabase.from(T).update({ applied_at: null, status: 'pending', updated_at: new Date().toISOString() }).eq('id', order.id);
    log('error', 'attaching payment failed, will retry', { reference: order.reference, message: err.message });
    throw new HttpError(502, 'Your payment was received but we could not update your advert yet. Please check again in a moment.');
  }
  log('info', 'advert paid', { reference: order.reference, source });
  return claimed[0];
}

async function verifyAndSettleOrder(order, { source = 'verify', returned = false } = {}) {
  if (order.applied_at || order.kind !== 'paid') return order;
  let tx;
  try {
    tx = await paystack.verifyTransaction(order.reference);
  } catch (err) {
    if (err.code === 'rejected' && err.status === 404) tx = { status: returned ? 'abandoned' : 'ongoing' };
    else {
      log('warn', 'verify call failed', { reference: order.reference, code: err.code, message: err.message });
      throw new HttpError(502, "We couldn't confirm your payment with Paystack just yet. If you paid, your money is safe — check again in a moment.");
    }
  }
  return settleOrder(order, tx, { source, returned });
}

/** Asks Paystack about every open order of an advert. -> true when one of them turned out to be paid. */
async function settleOpenOrdersFor(adId, { returned = false } = {}) {
  if (!paystack.config().enabled) return false;
  const open = ok(await supabase.from(T).select('*').eq('ad_id', adId).eq('status', 'pending').is('applied_at', null));
  let paid = false;
  for (const o of open) {
    try {
      const s = await verifyAndSettleOrder(o, { source: 'recheck', returned });
      if (s.status === 'success') paid = true;
    } catch (err) {
      log('warn', 'recheck failed', { reference: o.reference, message: err.message });
    }
  }
  return paid;
}

/** Paystack (or an admin) says an order was refunded: the advert it paid for stops. */
async function handleOrderRefund(reference, { admin = null } = {}) {
  const order = await findOrder(reference);
  if (!order) return 'unknown_reference';
  if (order.status === 'refunded') return 'already_refunded';
  const now = new Date().toISOString();
  ok(await supabase.from(T).update({ status: 'refunded', refund_status: 'refunded', updated_at: now }).eq('id', order.id));
  const ad = ok(await supabase.from('sponsored_ads').select('id, status').eq('id', order.ad_id).maybeSingle());
  if (ad && ['awaiting_payment', 'pending_review', 'rejected', 'approved', 'suspended'].includes(ad.status)) {
    const others = ok(await supabase.from(T).select('id').eq('ad_id', ad.id).eq('status', 'success').neq('id', order.id));
    if (!others.length) {
      const live = ad.status === 'approved' || ad.status === 'suspended';
      ok(await supabase.from('sponsored_ads').update({ status: live ? 'removed' : 'withdrawn', review_note: 'The payment for this advert was refunded.', updated_at: now }).eq('id', ad.id));
      ads().forgetLive();
    }
  }
  await ads().logAd(order.ad_id, { actor: admin ? 'admin' : 'system', email: admin?.email || null, action: 'refunded', note: reference });
  log('warn', 'advert payment refunded', { reference });
  return 'refunded';
}

module.exports = { PREFIX, isAdReference, STATUS_MESSAGES, orderDto, findOrder, createCheckout, judgeOrder, settleOrder, verifyAndSettleOrder, settleOpenOrdersFor, handleOrderRefund };
