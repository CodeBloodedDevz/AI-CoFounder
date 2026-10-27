// Small in-memory rate limiter for the public /auth routes (they have no login
// to key on). Limits are read on every request so they can be tuned with env vars.
// The per-email limits that matter most (resend cooldown, hourly send cap, wrong
// guesses) are also stored in the database, so they survive a server restart.

const buckets = new Map(); // key -> [timestamps]

setInterval(() => {
  const cutoff = Date.now() - 60 * 60_000;
  for (const [k, v] of buckets) if (!v.some((t) => t > cutoff)) buckets.delete(k);
}, 10 * 60_000).unref();

/** -> { ok, retryAfterSeconds } and records the hit when ok. */
function hit(key, max, windowMs, now = Date.now()) {
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { ok: true, retryAfterSeconds: 0 };
}

const reset = () => buckets.clear();
const envInt = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Express middleware. `rules` is a function (req) => [{ key, max, windowMs }].
 * Responds 429 with Retry-After when any rule is exceeded.
 */
function limit(rules) {
  return (req, res, next) => {
    for (const r of rules(req)) {
      const out = hit(r.key, r.max, r.windowMs);
      if (!out.ok) {
        res.set('Retry-After', String(out.retryAfterSeconds));
        return res.status(429).json({
          error: `Too many attempts. Please wait ${out.retryAfterSeconds} seconds and try again.`,
          code: 'rate_limited',
          retryAfterSeconds: out.retryAfterSeconds,
        });
      }
    }
    next();
  };
}

module.exports = { limit, hit, reset, envInt };
