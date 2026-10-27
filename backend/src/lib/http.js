// Small shared helpers for the route files: consistent errors, input
// parsing and validation. No dependencies.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
const badRequest = (message) => new HttpError(400, message);
const notFound = (message) => new HttpError(404, message);

// Express 4 doesn't catch rejected promises from async handlers; wrapping each
// handler sends the error to the central handler in server.js instead of
// leaving the request hanging.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Turns Postgres/PostgREST errors into friendly HTTP errors instead of
 * leaking raw database messages. Throw the result.
 */
function dbError(error) {
  const code = error?.code;
  if (code === '23505') return new HttpError(409, 'That already exists.');
  if (code === '23503') return badRequest('That refers to something that does not exist.');
  if (code === '23502') return badRequest('A required value is missing.');
  if (code === '23514' || code === '22P02' || code === '22007' || code === '22008' || code === '22003') {
    return badRequest('One of the values is not valid.');
  }
  console.error('[db]', code || '', error?.message || error);
  return new HttpError(500, 'Something went wrong saving that. Please try again.');
}

/** Use after any supabase call: `const rows = ok(await supabase.from(...)...)`. */
function ok({ data, error }) {
  if (error) throw dbError(error);
  return data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/** router.param handler: a malformed :id is a 404, not a database error. */
function validateIdParam(req, res, next, value) {
  if (!isUuid(value)) return next(notFound('Not found.'));
  next();
}

/**
 * Parses numbers the way people actually type them in South Africa:
 * 50, "50.5", "50,5" (comma decimals), "R 1 250,50", "1,250.00".
 * Returns a finite number, or null when it isn't one.
 */
function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  let s = value.replace(/[\s ]/g, '').replace(/^[Rr]/, '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: whichever comes last is the decimal mark.
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma !== -1) {
    // "1,250" / "1,250,000" are thousands; "50,5" / "1,25" are decimals.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Trimmed string clipped to `max`; returns undefined when the value is absent. */
function cleanText(value, max = 200) {
  if (value === undefined || value === null) return undefined;
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** True for a real calendar date written YYYY-MM-DD. */
function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date in South Africa (not UTC), as YYYY-MM-DD. */
const todayInSA = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

/** Escapes % _ \ so user text can be used with ilike as an exact, case-insensitive match. */
const escapeLike = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

/** Copies only the allowed keys that were actually sent. */
function pick(body, keys) {
  const out = {};
  for (const k of keys) if (body && body[k] !== undefined) out[k] = body[k];
  return out;
}

module.exports = {
  HttpError,
  badRequest,
  notFound,
  wrap,
  dbError,
  ok,
  isUuid,
  validateIdParam,
  parseNumber,
  cleanText,
  isIsoDate,
  todayInSA,
  escapeLike,
  pick,
};
