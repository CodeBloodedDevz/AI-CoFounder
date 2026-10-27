// The payment workflow. The golden rule: a subscription is only ever activated
// by settlePayment(), and settlePayment() only activates after Paystack's own
// verify API has confirmed — for THIS reference — a successful payment of the
// exact amount and currency we asked for, for the plan we stored. Nothing the
// app, the redirect URL or a webhook body says is trusted on its own.

const supabase = require('../supabaseClient');
const paystack = require('./paystack');
const plans = require('./plans');
const { HttpError, ok, dbError, todayInSA } = require('./http');

const PENDING_REUSE_MS = 30 * 60_000; // an open checkout this young is reused instead of creating another
const EXPIRY_MS = () => (Number(process.env.PAYMENT_EXPIRY_MINUTES) > 0 ? Number(process.env.PAYMENT_EXPIRY_MINUTES) : 60) * 60_000;
const RENEW_WINDOW_DAYS = 7;

const log = (level, msg, extra = {}) => console[level === 'info' ? 'log' : level](`[payments] ${msg}`, Object.keys(extra).length ? JSON.stringify(extra) : '');

/* ------------------------------ read helpers ------------------------------ */

const STATUS_MESSAGES = {
  pending: 'Waiting for your payment to be confirmed.',
  success: 'Payment confirmed. Your plan is active.',
  failed: 'The payment was not successful, so you have not been charged for this plan. You can try again.',
  cancelled: 'The payment was cancelled before it was completed. You can try again.',
  expired: 'This payment session expired. You can start again.',
  mismatch: "We couldn't match this payment to your order, so your plan was not changed. Please contact support with your reference.",
  refunded: 'This payment was refunded.',
};

function paymentDto(p) {
  if (!p) return null;
  return {
    reference: p.reference,
    planId: p.plan_id,
    plan: plans.PLANS[p.plan_id]?.name || p.plan_id,
    billingCycle: p.billing_cycle,
    amount: Number(p.amount) / 100,
    currency: p.currency,
    status: p.status,
    message: STATUS_MESSAGES[p.status] || '',
    mode: p.mode,
    channel: p.channel || null,
    createdAt: p.created_at,
    paidAt: p.paid_at || null,
  };
}

const monthYear = (m, y) => (m && y ? `${String(m).padStart(2, '0')}/${String(y).slice(-2)}` : null);

/**
 * The subscription as the app should see it, worked out from a subscriptions row (or null):
 * expired plans are already back on Free. Pure, so the admin portal applies the exact same rules
 * to every business at once.
 */
function subscriptionView(row, today = todayInSA()) {
  const paid = row && plans.isPaidPlan(row.plan_id);
  const expired = Boolean(paid && row.renews_on && row.renews_on < today);
  const effectiveId = paid && !expired ? row.plan_id : 'free';
  const cancelling = Boolean(paid && !expired && row.cancel_at_period_end);
  return {
    planId: effectiveId,
    plan: plans.PLANS[effectiveId].name,
    billingCycle: effectiveId === 'free' ? null : row.billing_cycle,
    status: effectiveId === 'free' ? (expired ? 'expired' : 'free') : 'active',
    startedOn: effectiveId === 'free' ? null : row.started_on,
    renewsOn: effectiveId === 'free' ? null : row.renews_on,
    cancelAtPeriodEnd: cancelling,
    expiredPlan: expired ? plans.PLANS[row.plan_id]?.name : null,
    paymentMethod: paid && row.payment_last4 ? { brand: row.payment_brand || 'Card', last4: row.payment_last4, expiry: row.payment_expiry || '' } : null,
    lastReference: row?.last_payment_reference || null,
    entitlements: plans.entitlementsFor(effectiveId),
  };
}

/** The subscription as the app should see it: expired plans are already back on Free. */
async function getSubscription(businessId, today = todayInSA()) {
  const row = ok(await supabase.from('subscriptions').select('*').eq('business_id', businessId).maybeSingle());
  return subscriptionView(row, today);
}

async function listPayments(businessId, limit = 10) {
  const rows = ok(await supabase.from('payments').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(limit));
  return rows.map(paymentDto);
}

async function findPayment(reference, businessId) {
  let q = supabase.from('payments').select('*').eq('reference', String(reference));
  if (businessId) q = q.eq('business_id', businessId);
  return ok(await q.maybeSingle());
}

/* -------------------------------- checkout -------------------------------- */

/**
 * Starts a payment: validates the plan against what the person already has,
 * takes the price from OUR plan table, records a pending payment, and asks
 * Paystack for the checkout URL.
 */
async function createCheckout({ business, user, planId, billingCycle, callbackUrl }) {
  const cfg = paystack.config();
  if (!cfg.enabled) throw new HttpError(503, 'Payments are not available right now.');
  if (!plans.isPaidPlan(planId)) throw new HttpError(400, 'Choose the Pro or Premium plan to pay for.');
  if (!plans.isCycle(billingCycle)) throw new HttpError(400, 'Billing must be monthly or annual.');
  if (!user.email) throw new HttpError(400, 'Your account has no email address, which payments need.');

  const amount = plans.priceInCents(planId, billingCycle);
  const current = await getSubscription(business.id);

  if (current.planId !== 'free') {
    const daysLeft = plans.daysBetween(todayInSA(), current.renewsOn);
    if (plans.rank(current.planId) > plans.rank(planId)) {
      throw Object.assign(new HttpError(409, `You are on the ${current.plan} plan until ${current.renewsOn}. You can choose ${plans.PLANS[planId].name} after it ends.`), { code: 'higher_plan_active' });
    }
    if (current.planId === planId && daysLeft > RENEW_WINDOW_DAYS) {
      throw Object.assign(new HttpError(409, `You already have the ${current.plan} plan until ${current.renewsOn}. You can renew in the last ${RENEW_WINDOW_DAYS} days.`), { code: 'already_subscribed' });
    }
  }

  // The same open checkout is reused, so double-taps and retries never create duplicate charges.
  const open = ok(
    await supabase.from('payments').select('*').eq('business_id', business.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(5)
  ).find(
    (p) => p.plan_id === planId && p.billing_cycle === billingCycle && Number(p.amount) === amount && p.currency === cfg.currency && p.mode === cfg.mode &&
      p.authorization_url && Date.now() - Date.parse(p.created_at) < PENDING_REUSE_MS && Date.parse(p.expires_at) > Date.now()
  );
  if (open) return { payment: open, reused: true };

  const reference = paystack.newReference();
  const payment = ok(
    await supabase
      .from('payments')
      .insert({
        business_id: business.id,
        user_id: user.id,
        email: String(user.email).toLowerCase(),
        reference,
        plan_id: planId,
        billing_cycle: billingCycle,
        amount,
        currency: cfg.currency,
        status: 'pending',
        mode: cfg.mode,
        expires_at: new Date(Date.now() + EXPIRY_MS()).toISOString(),
      })
      .select()
      .single()
  );

  try {
    const init = await paystack.initializeTransaction({
      email: payment.email,
      amount,
      currency: cfg.currency,
      reference,
      callbackUrl,
      metadata: { payment_id: payment.id, business_id: business.id, plan_id: planId, billing_cycle: billingCycle },
    });
    if (!init?.authorization_url || init.reference !== reference) throw new paystack.PaystackError('Paystack returned an unexpected checkout.', { code: 'bad_response' });
    const updated = ok(
      await supabase.from('payments').update({ authorization_url: init.authorization_url, access_code: init.access_code || null, updated_at: new Date().toISOString() }).eq('id', payment.id).select().single()
    );
    log('info', 'checkout started', { reference, plan: planId, cycle: billingCycle, mode: cfg.mode });
    return { payment: updated, reused: false };
  } catch (err) {
    await supabase.from('payments').update({ status: 'failed', failure_reason: `init_failed: ${err.message}`.slice(0, 300), updated_at: new Date().toISOString() }).eq('id', payment.id);
    log('error', 'initialize failed', { reference, code: err.code, message: err.message });
    throw new HttpError(502, "We couldn't start the payment with Paystack. You have not been charged. Please try again in a moment.");
  }
}

/* -------------------------------- settling -------------------------------- */

/** Decides what a Paystack transaction means for OUR stored expectation. -> { status, reason } */
function judge(payment, tx, { returned = false } = {}) {
  const gateway = String(tx?.status || '').toLowerCase();
  if (gateway === 'success') {
    const problems = [];
    if (tx.reference !== payment.reference) problems.push('reference differs');
    if (Number(tx.amount) !== Number(payment.amount)) problems.push(`amount ${tx.amount} != expected ${payment.amount}`);
    if (String(tx.currency || '').toUpperCase() !== String(payment.currency).toUpperCase()) problems.push(`currency ${tx.currency} != expected ${payment.currency}`);
    const meta = tx.metadata && typeof tx.metadata === 'object' ? tx.metadata : {};
    if (meta.payment_id !== payment.id || meta.plan_id !== payment.plan_id || meta.billing_cycle !== payment.billing_cycle) problems.push('plan metadata differs');
    const email = String(tx.customer?.email || '').toLowerCase();
    if (payment.email && email && email !== payment.email) problems.push('customer email differs');
    return problems.length ? { status: 'mismatch', reason: problems.join('; ') } : { status: 'success' };
  }
  if (gateway === 'failed') return { status: 'failed', reason: String(tx.gateway_response || 'declined').slice(0, 200) };
  if (gateway === 'reversed') return { status: 'failed', reason: 'reversed' };
  // Paystack calls a checkout that hasn't been paid yet "abandoned" - including one the person is still filling in.
  // So it only counts as cancelled when the person has actually come back without paying (or said so).
  if (gateway === 'abandoned' && returned) return { status: 'cancelled', reason: 'abandoned' };
  return { status: 'pending' }; // ongoing / pending / processing / queued / abandoned-but-still-open
}

async function applySubscription(payment, tx) {
  const today = todayInSA();
  const existing = ok(await supabase.from('subscriptions').select('*').eq('business_id', payment.business_id).maybeSingle());
  const stillActive = existing && existing.plan_id === payment.plan_id && existing.renews_on && existing.renews_on >= today;
  const base = stillActive ? existing.renews_on : today; // renewing early adds time on; a new/upgraded plan starts today
  const auth = tx?.authorization || {};
  const fields = {
    plan: plans.PLANS[payment.plan_id].name,
    plan_id: payment.plan_id,
    billing_cycle: payment.billing_cycle,
    status: 'active',
    started_on: stillActive ? existing.started_on || today : today,
    renews_on: plans.addPeriod(base, payment.billing_cycle),
    cancel_at_period_end: false,
    last_payment_reference: payment.reference,
    updated_at: new Date().toISOString(),
  };
  if (auth.last4) {
    const brand = String(auth.card_type || auth.brand || 'Card').trim();
    fields.payment_brand = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card';
    fields.payment_last4 = String(auth.last4).slice(-4);
    fields.payment_expiry = monthYear(auth.exp_month, auth.exp_year);
  }
  if (existing) {
    ok(await supabase.from('subscriptions').update(fields).eq('business_id', payment.business_id));
  } else {
    const { error } = await supabase.from('subscriptions').insert({ business_id: payment.business_id, ...fields });
    if (error) {
      if (error.code !== '23505') throw dbError(error);
      ok(await supabase.from('subscriptions').update(fields).eq('business_id', payment.business_id)); // lost a race: update instead
    }
  }
  const check = ok(await supabase.from('subscriptions').select('*').eq('business_id', payment.business_id).maybeSingle());
  if (!check || check.plan_id !== payment.plan_id || check.renews_on !== fields.renews_on) throw new Error('subscription did not save');
  return check;
}

/**
 * Brings our payment record in line with what Paystack says, and — only for a
 * verified, matching, successful payment — activates the plan exactly once.
 * `tx` is Paystack's verify response. Returns the up-to-date payment row.
 */
async function settlePayment(payment, tx, { source = 'verify', returned = false } = {}) {
  if (payment.applied_at) return payment; // already activated: final, never changed by later notifications

  const verdict = judge(payment, tx, { returned });
  const now = new Date().toISOString();

  if (verdict.status !== 'success') {
    let status = verdict.status;
    if ((status === 'pending') && Date.parse(payment.expires_at) < Date.now()) status = 'expired';
    if (status === 'mismatch') log('error', 'PAYMENT MISMATCH - plan NOT activated', { reference: payment.reference, source, reason: verdict.reason });
    const rows = ok(
      await supabase.from('payments').update({
        status,
        failure_reason: verdict.reason || null,
        gateway_response: tx?.gateway_response ? String(tx.gateway_response).slice(0, 200) : null,
        verified_at: now,
        updated_at: now,
      }).eq('id', payment.id).is('applied_at', null).select()
    );
    log('info', 'payment not successful', { reference: payment.reference, status, source });
    return rows[0] || (await findPayment(payment.reference));
  }

  // Verified success. Claim the activation: only one caller can flip applied_at from null.
  const auth = tx.authorization || {};
  const claimed = ok(
    await supabase.from('payments').update({
      status: 'success',
      applied_at: now,
      verified_at: now,
      paid_at: tx.paid_at || now,
      paystack_id: tx.id ?? null,
      channel: tx.channel || null,
      card_brand: auth.card_type ? String(auth.card_type).trim() : null,
      card_last4: auth.last4 || null,
      card_expiry: monthYear(auth.exp_month, auth.exp_year),
      gateway_response: tx.gateway_response ? String(tx.gateway_response).slice(0, 200) : null,
      failure_reason: null,
      updated_at: now,
    }).eq('id', payment.id).is('applied_at', null).select()
  );
  if (!claimed.length) return findPayment(payment.reference); // someone else just activated it

  try {
    await applySubscription(payment, tx);
  } catch (err) {
    // Money was taken but the plan didn't save: undo the claim so the next verify / webhook retry finishes the job.
    await supabase.from('payments').update({ applied_at: null, status: 'pending', updated_at: new Date().toISOString() }).eq('id', payment.id);
    log('error', 'activation failed, will retry', { reference: payment.reference, message: err.message });
    throw new HttpError(502, 'Your payment was received but we could not activate your plan yet. Please check again in a moment.');
  }
  log('info', 'subscription activated', { reference: payment.reference, plan: payment.plan_id, cycle: payment.billing_cycle, source });
  return claimed[0];
}

/** Asks Paystack about a payment and settles it. Used by the app, the return page and the webhook. */
async function verifyAndSettle(payment, { source = 'verify', returned = false } = {}) {
  if (payment.applied_at) return payment;
  let tx;
  try {
    tx = await paystack.verifyTransaction(payment.reference);
  } catch (err) {
    // Paystack doesn't know the reference (never opened checkout): treat as still pending / expired, not as an error.
    if (err.code === 'rejected' && err.status === 404) tx = { status: 'abandoned_unknown' }; // checkout never opened
    else {
      log('warn', 'verify call failed', { reference: payment.reference, code: err.code, message: err.message });
      throw new HttpError(502, "We couldn't confirm your payment with Paystack just yet. If you paid, your money is safe — check again in a moment.");
    }
  }
  if (tx.status === 'abandoned_unknown') tx = { status: returned ? 'abandoned' : 'ongoing' };
  return settlePayment(payment, tx, { source, returned });
}

/** Paystack says a payment was refunded: mark it, and end the plan it bought if it is the current one. */
async function handleRefund(reference) {
  const payment = await findPayment(reference);
  if (!payment) return 'unknown_reference';
  if (payment.status === 'refunded') return 'already_refunded';
  ok(await supabase.from('payments').update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('id', payment.id));
  const sub = ok(await supabase.from('subscriptions').select('*').eq('business_id', payment.business_id).maybeSingle());
  if (sub && sub.last_payment_reference === reference) {
    ok(await supabase.from('subscriptions').update({ plan: 'Free', plan_id: 'free', status: 'active', billing_cycle: null, renews_on: null, cancel_at_period_end: false, updated_at: new Date().toISOString() }).eq('business_id', payment.business_id));
  }
  log('warn', 'payment refunded', { reference });
  return 'refunded';
}

/** "Cancel subscription": the plan stays until the period the person paid for ends. */
async function cancelAtPeriodEnd(businessId) {
  const sub = await getSubscription(businessId);
  if (sub.planId === 'free') return sub;
  ok(await supabase.from('subscriptions').update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('business_id', businessId));
  return getSubscription(businessId);
}
async function resumeSubscription(businessId) {
  const sub = await getSubscription(businessId);
  if (sub.planId === 'free') return sub;
  ok(await supabase.from('subscriptions').update({ cancel_at_period_end: false, updated_at: new Date().toISOString() }).eq('business_id', businessId));
  return getSubscription(businessId);
}

module.exports = { paymentDto, subscriptionView, STATUS_MESSAGES, getSubscription, listPayments, findPayment, createCheckout, judge, settlePayment, verifyAndSettle, handleRefund, cancelAtPeriodEnd, resumeSubscription, RENEW_WINDOW_DAYS };
