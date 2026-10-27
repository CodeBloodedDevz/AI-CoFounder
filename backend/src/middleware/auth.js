const crypto = require('node:crypto');
const supabase = require('../supabaseClient');

// The app sends several requests at once (it loads business, products, services, customers, work,
// transactions and billing together). Asking Supabase Auth to check the same token for each one made
// every screen load slow, so a token that was just checked is trusted for a short while.
// A token is never trusted beyond its own expiry, and a cache entry lasts at most AUTH_CACHE_SECONDS (default 30).
const userCache = new Map(); // sha256(token) -> { user, until }
const cacheMs = () => {
  const n = Number(process.env.AUTH_CACHE_SECONDS);
  return (Number.isFinite(n) && n >= 0 ? n : 30) * 1000;
};
function tokenExpiryMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.exp ? payload.exp * 1000 : 0;
  } catch (e) {
    return 0;
  }
}
async function getUserForToken(token) {
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const hit = userCache.get(key);
  if (hit && hit.until > Date.now()) return { data: { user: hit.user }, error: null };
  const result = await supabase.auth.getUser(token);
  const ttl = cacheMs();
  if (!result.error && result.data?.user && ttl > 0) {
    const until = Math.min(Date.now() + ttl, tokenExpiryMs(token) || Date.now() + ttl);
    userCache.set(key, { user: result.data.user, until });
    if (userCache.size > 2000) for (const [k, v] of userCache) if (v.until <= Date.now()) userCache.delete(k);
  }
  return result;
}
const clearAuthCache = () => userCache.clear();

/** True while a Supabase Auth ban is in force (that is how the admin portal suspends an account). */
function isSuspended(user, now = Date.now()) {
  const until = user?.banned_until;
  if (!until) return false;
  const t = Date.parse(until);
  return Number.isFinite(t) && t > now;
}

/**
 * The mobile app logs in via Supabase Auth directly and gets back a JWT
 * (access_token). It sends that token on every request as:
 *   Authorization: Bearer <token>
 *
 * This middleware checks that token is real and not expired, and attaches:
 *   req.user      -> the Supabase auth user record
 *   req.business  -> that user's business row (or null if they haven't
 *                    finished BusinessSetupScreen yet)
 *
 * Note: the app signs the user out when it sees "Invalid or expired session",
 * so that exact message is ONLY used for a genuinely bad token. If Supabase
 * itself is unreachable we answer 503 with a different message instead.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization header (expected "Bearer <token>").' });
    }

    const { data, error } = await getUserForToken(token);
    if (error || !data?.user) {
      // Supabase 5xx / network trouble is not the user's fault.
      if (error && (error.status >= 500 || error.name === 'AuthRetryableFetchError')) {
        return res.status(503).json({ error: 'The login service is temporarily unavailable. Please try again.' });
      }
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    req.user = data.user;

    // An account an administrator suspended (Supabase Auth ban) stops working straight away, even with a
    // login token issued before the suspension. Sign-in itself is already refused by Supabase while banned.
    if (isSuspended(data.user)) {
      return res.status(403).json({
        error: 'This account has been suspended. Please contact support.',
        code: 'account_suspended',
      });
    }

    // Accounts must have proved they own their email (registration OTP) before anything else works.
    if (!data.user.email_confirmed_at && process.env.REQUIRE_VERIFIED_EMAIL !== 'false') {
      return res.status(403).json({
        error: 'Please verify your email address to continue.',
        code: 'email_not_verified',
      });
    }

    // order+limit instead of maybeSingle(): never errors if duplicate rows exist.
    const { data: rows, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', req.user.id)
      .order('created_at', { ascending: true })
      .limit(1);

    if (businessError) {
      console.error('[auth] business lookup failed:', businessError.message);
      return res.status(500).json({ error: 'Could not load your business. Please try again.' });
    }

    req.business = rows?.[0] || null;
    next();
  } catch (err) {
    console.error('[auth]', err);
    res.status(503).json({ error: 'The login service is temporarily unavailable. Please try again.' });
  }
}

/**
 * Chain this AFTER requireAuth on any route that needs an existing
 * business (i.e. everything except GET/PUT /business itself).
 */
function requireBusiness(req, res, next) {
  if (!req.business) {
    return res.status(400).json({
      error: 'No business profile yet. Call PUT /business first (this is what BusinessSetupScreen should call).',
    });
  }
  next();
}

module.exports = { requireAuth, requireBusiness, clearAuthCache, getUserForToken, isSuspended };
