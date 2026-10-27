// Account recovery keys: how people prove an account is theirs without email.
//
// When an account is created the server generates a random recovery key, e.g.  K7MQ2-XWPAH-3DRTN-VYC9E
// (20 characters from a 31-letter alphabet without look-alikes such as 0/O and 1/I/L: about 99 bits of
// randomness, so it cannot be guessed). The person sees it ONCE and keeps it (screenshot, notes, paper).
// "Forgot password" asks for the email, the recovery key and a new password. A correct key is used up and a
// new one is issued straight away (shown once again).
//
// Storage: only an HMAC-SHA256 of the key (keyed with RECOVERY_SECRET, which never leaves the server), in the
// private email_otps table (row id "recovery:<email>", row level security on, no public access). Keys and
// hashes are never logged or sent anywhere except the one response that shows a new key to its owner.
// Guessing is limited per account (RECOVERY_MAX_ATTEMPTS wrong keys -> locked for RECOVERY_LOCK_MINUTES)
// on top of the per-IP / per-email request limits in routes/auth.js.

const crypto = require('node:crypto');
const supabase = require('../supabaseClient');
const { HttpError } = require('./http');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 symbols, no 0 O 1 I L
const GROUPS = 4;
const GROUP_LEN = 5;

const num = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const config = () => ({ maxAttempts: Math.round(num('RECOVERY_MAX_ATTEMPTS', 8)), lockMinutes: num('RECOVERY_LOCK_MINUTES', 60) });

class RecoveryError extends HttpError {
  constructor(status, code, message, extra = {}) {
    super(status, message);
    this.code = code;
    this.extra = extra;
  }
}

const normEmail = (e) => String(e || '').trim().toLowerCase();
const rowKey = (email) => `recovery:${normEmail(email)}`;

function secret() {
  const s = process.env.RECOVERY_SECRET || process.env.OTP_SECRET;
  if (s) return s;
  // Last resort: derived from the service-role key (just as private). Set RECOVERY_SECRET in .env.
  return crypto.createHash('sha256').update(`recovery:${process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev'}`).digest('hex');
}

/** A fresh random key, "XXXXX-XXXXX-XXXXX-XXXXX". */
function generateKey() {
  const chars = Array.from({ length: GROUPS * GROUP_LEN }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]);
  const groups = [];
  for (let i = 0; i < GROUPS; i++) groups.push(chars.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN).join(''));
  return groups.join('-');
}

/** What the person typed -> the 20 key characters (spaces, dashes and lower case don't matter). */
function normalizeKey(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const hashKey = (email, key) => crypto.createHmac('sha256', secret()).update(`${normEmail(email)}:${normalizeKey(key)}`).digest('hex');

async function getRow(email) {
  const { data, error } = await supabase.from('email_otps').select('*').eq('email', rowKey(email)).maybeSingle();
  if (error) throw new HttpError(503, 'Account recovery is unavailable right now. Please try again.');
  return data || null;
}

/** Creates (or replaces) the account's recovery key. Returns the key: show it once, never store it. */
async function issueKey(email, userId) {
  const key = generateKey();
  const now = new Date().toISOString();
  const fields = {
    user_id: userId,
    code_hash: hashKey(email, key),
    expires_at: new Date(Date.now() + 100 * 365 * 86_400_000).toISOString(), // doesn't expire; replaced when used
    attempts: 0,
    consumed_at: null,
    last_sent_at: now,
    send_window_started_at: now,
    sends_in_window: 1,
  };
  const existing = await getRow(email);
  const res = existing
    ? await supabase.from('email_otps').update(fields).eq('email', rowKey(email))
    : await supabase.from('email_otps').insert({ email: rowKey(email), ...fields });
  if (res.error) {
    console.error('[recovery] could not store a recovery key:', res.error.code || '', res.error.message);
    throw new HttpError(503, 'Could not create a recovery key right now. Please try again.');
  }
  return key;
}

/** { hasKey, createdAt } for the account (never the key). */
async function status(email) {
  const row = await getRow(email);
  return { hasKey: Boolean(row && !row.consumed_at), createdAt: row?.last_sent_at || null };
}

/**
 * Checks a recovery key. On success the key is used up (single use) and { userId, consumedHash } is returned.
 * Wrong keys count towards a lock; the same vague message is used whether or not the email has an account.
 */
async function verifyKey(email, key) {
  const cfg = config();
  const wrong = () => new RecoveryError(400, 'invalid_key', 'That email and recovery key do not match. Check the key and try again.');
  const typed = normalizeKey(key);
  if (typed.length !== GROUPS * GROUP_LEN) throw new RecoveryError(400, 'invalid_key', `A recovery key has ${GROUPS * GROUP_LEN} letters and numbers, like K7MQ2-XWPAH-3DRTN-VYC9E.`);

  const row = await getRow(email);
  if (!row || row.consumed_at) throw wrong();

  // Locked after too many wrong keys; the lock lifts after RECOVERY_LOCK_MINUTES.
  const windowStart = new Date(row.send_window_started_at || 0).getTime();
  const lockEnds = windowStart + cfg.lockMinutes * 60_000;
  if (row.attempts >= cfg.maxAttempts) {
    if (Date.now() < lockEnds) {
      const retryAfterSeconds = Math.ceil((lockEnds - Date.now()) / 1000);
      throw new RecoveryError(429, 'locked', `Too many wrong recovery keys. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`, { retryAfterSeconds });
    }
    await supabase.from('email_otps').update({ attempts: 0, send_window_started_at: new Date().toISOString() }).eq('email', rowKey(email));
  }

  // Count this try atomically (the database function only counts while under the limit).
  const counted = await supabase.rpc('otp_attempt', { p_email: rowKey(email), p_max: cfg.maxAttempts });
  if (counted.error) {
    console.error('[recovery] attempt counter failed:', counted.error.code || '', counted.error.message);
    throw new HttpError(503, 'Account recovery is unavailable right now. Please try again.');
  }
  const current = (counted.data || [])[0];
  if (!current) throw new RecoveryError(429, 'locked', `Too many wrong recovery keys. Try again in ${cfg.lockMinutes} minutes.`);

  const expected = Buffer.from(String(current.code_hash), 'hex');
  const given = Buffer.from(hashKey(email, typed), 'hex');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    const left = Math.max(0, cfg.maxAttempts - current.attempts);
    const err = wrong();
    err.extra = { attemptsLeft: left };
    throw err;
  }

  // Use it up: only the request that flips consumed_at wins (two requests with the same key can't both pass).
  const used = await supabase
    .from('email_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('email', rowKey(email))
    .eq('code_hash', current.code_hash)
    .is('consumed_at', null)
    .select();
  if (used.error || !used.data?.length) throw wrong();
  return { userId: current.user_id, consumedHash: current.code_hash };
}

/** Puts a used key back (e.g. the password change itself failed), so the person can try again. */
async function restoreKey(email, consumedHash) {
  await supabase.from('email_otps').update({ consumed_at: null }).eq('email', rowKey(email)).eq('code_hash', consumedHash);
}

module.exports = { generateKey, normalizeKey, hashKey, issueKey, verifyKey, restoreKey, status, config, normEmail, RecoveryError, ALPHABET };
