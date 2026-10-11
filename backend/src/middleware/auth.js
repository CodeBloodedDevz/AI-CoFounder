const supabase = require('../supabaseClient');

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

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      // Supabase 5xx / network trouble is not the user's fault.
      if (error && (error.status >= 500 || error.name === 'AuthRetryableFetchError')) {
        return res.status(503).json({ error: 'The login service is temporarily unavailable. Please try again.' });
      }
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    req.user = data.user;

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

module.exports = { requireAuth, requireBusiness };
