// Thin, careful client for Paystack (https://paystack.com/docs/api).
//
// Test vs live is decided ONLY by the secret key in the environment:
//   PAYSTACK_SECRET_KEY=sk_test_...   -> test mode (no real money moves)
//   PAYSTACK_SECRET_KEY=sk_live_...   -> live mode, and ONLY if PAYSTACK_ALLOW_LIVE=true
// so going live is an .env change, and a live key can't be used by accident
// while you are still developing.
//
// The secret key never leaves this file's process: it is not logged, not sent
// to the app, and not included in any error message.

const crypto = require('node:crypto');

const BASE = 'https://api.paystack.co';

class PaystackError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'PaystackError';
    this.status = status;
    this.code = code; // not_configured | network | timeout | rejected | bad_response
  }
}

function config() {
  const key = String(process.env.PAYSTACK_SECRET_KEY || '').trim();
  const mode = /^sk_test_/.test(key) ? 'test' : /^sk_live_/.test(key) ? 'live' : null;
  const liveAllowed = String(process.env.PAYSTACK_ALLOW_LIVE || '').toLowerCase() === 'true';
  const enabled = mode === 'test' || (mode === 'live' && liveAllowed);
  let reason = null;
  if (!key) reason = 'missing_key';
  else if (!mode) reason = 'invalid_key';
  else if (mode === 'live' && !liveAllowed) reason = 'live_not_allowed';
  return { key, mode, enabled, reason, currency: String(process.env.PAYSTACK_CURRENCY || 'ZAR').toUpperCase() };
}

async function request(method, path, body) {
  const { key, enabled } = config();
  if (!enabled) throw new PaystackError('Payments are not set up on the server.', { code: 'not_configured' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!json || typeof json !== 'object') throw new PaystackError(`Paystack answered with something unreadable (${res.status}).`, { status: res.status, code: 'bad_response' });
    if (!res.ok || json.status === false) {
      throw new PaystackError(String(json.message || `Paystack refused the request (${res.status}).`).slice(0, 300), { status: res.status, code: 'rejected' });
    }
    return json.data;
  } catch (err) {
    if (err instanceof PaystackError) throw err;
    if (err.name === 'AbortError') throw new PaystackError('Paystack took too long to answer.', { code: 'timeout' });
    throw new PaystackError(`Could not reach Paystack: ${err.message}`, { code: 'network' });
  } finally {
    clearTimeout(timer);
  }
}

/** -> { authorization_url, access_code, reference } */
const initializeTransaction = ({ email, amount, currency, reference, callbackUrl, metadata }) =>
  request('POST', '/transaction/initialize', { email, amount, currency, reference, callback_url: callbackUrl, metadata });

/** -> the transaction: { id, status, reference, amount, currency, paid_at, channel, gateway_response, authorization, customer, metadata } */
const verifyTransaction = (reference) => request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);

/**
 * Paystack signs every webhook with HMAC-SHA512 of the RAW request body, using
 * the secret key, in the x-paystack-signature header. Compared in constant time.
 */
function verifySignature(rawBody, signature) {
  const { key } = config();
  if (!key || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest('hex');
  const given = String(signature).trim().toLowerCase();
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Unguessable reference, accepted by Paystack (letters, numbers, - . =). */
const newReference = () => `acf-${Date.now().toString(36)}-${crypto.randomBytes(9).toString('hex')}`;

module.exports = { PaystackError, config, initializeTransaction, verifyTransaction, verifySignature, newReference };
