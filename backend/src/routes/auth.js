// Accounts without email delivery: recovery keys instead of emailed codes.
//
//   POST /auth/register      { fullName, phone?, email, password }   -> creates the account (ready to log in) and
//                                                                       returns its recovery key ONCE
//   POST /auth/activate      { email, password }                     -> accounts made by the old email flow that
//                                                                       were never verified: the correct password
//                                                                       activates them (and returns a key if needed)
//   POST /auth/recover       { email, recoveryKey, password }        -> forgot password: a valid recovery key sets
//                                                                       the new password; a new key is returned ONCE
//   GET  /auth/recovery-key                       (logged in)        -> { hasKey, createdAt }
//   POST /auth/recovery-key  { password }         (logged in)        -> a new key (the old one stops working)
//
// Nothing here sends email or needs an email service. What this does NOT do: prove that the email address
// belongs to the person (no message is sent to it). The account is protected by its password, and recovery
// needs the recovery key that only the account owner was shown. See README -> Accounts and recovery keys.
// Keys and passwords are never logged.

const express = require('express');
const supabase = require('../supabaseClient');
const recovery = require('../lib/recovery');
const passwordCheck = require('../lib/passwordCheck');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { limit, envInt } = require('../lib/rateLimit');

const router = express.Router();

const MIN_PASSWORD = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN15 = 15 * 60_000;

const ip = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const emailOf = (req) => recovery.normEmail(req.body?.email);
const ipLimit = () => envInt('AUTH_IP_LIMIT_PER_15MIN', 30);

const registerLimit = limit((req) => [{ key: `reg:ip:${ip(req)}`, max: envInt('AUTH_REGISTER_LIMIT_PER_15MIN', 15), windowMs: MIN15 }]);
const recoverLimit = limit((req) => [
  { key: `rec:ip:${ip(req)}`, max: ipLimit(), windowMs: MIN15 },
  { key: `rec:em:${emailOf(req)}`, max: envInt('AUTH_RECOVER_LIMIT_PER_15MIN', 10), windowMs: MIN15 },
]);
const activateLimit = limit((req) => [
  { key: `act:ip:${ip(req)}`, max: ipLimit(), windowMs: MIN15 },
  { key: `act:em:${emailOf(req)}`, max: 10, windowMs: MIN15 },
]);
const keyLimit = limit((req) => [{ key: `key:user:${req.user?.id || ip(req)}`, max: 10, windowMs: MIN15 }]);

const sendError = (res, err) => {
  if (err instanceof recovery.RecoveryError) {
    if (err.extra?.retryAfterSeconds) res.set('Retry-After', String(err.extra.retryAfterSeconds));
    return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
  }
  throw err;
};

function checkPasswordRules(password) {
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters.`);
  if (password.length > 72) throw new HttpError(400, 'Password is too long (72 characters at most).');
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const hit = (data?.users || []).find((u) => String(u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if ((data?.users || []).length < 200) break;
  }
  return null;
}

const isDuplicate = (error) =>
  error && (error.code === 'email_exists' || error.code === 'user_already_exists' || /already (been )?registered|already exists/i.test(error.message || ''));

router.post('/register', registerLimit, wrap(async (req, res) => {
  const b = req.body || {};
  const fullName = String(b.fullName || '').trim().slice(0, 120);
  const phone = String(b.phone || '').trim().slice(0, 30);
  const email = recovery.normEmail(b.email);
  const password = typeof b.password === 'string' ? b.password : '';

  if (!fullName) throw new HttpError(400, 'Please enter your full name.');
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Please enter a valid email address.');
  checkPasswordRules(password);

  const metadata = { full_name: fullName, phone };
  let user;
  // No email is sent, so the account is ready to use straight away (Supabase marks it confirmed).
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
  if (created.error) {
    if (!isDuplicate(created.error)) {
      if (created.error.code === 'weak_password') throw new HttpError(400, created.error.message || 'That password is too weak.');
      console.error('[auth] createUser failed:', created.error.code || '', created.error.message);
      throw new HttpError(created.error.status >= 500 ? 503 : 400, "We couldn't create your account. Please try again.");
    }
    const existing = await findUserByEmail(email);
    if (!existing || existing.email_confirmed_at) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in.', code: 'already_registered' });
    }
    // Started with the old email-code sign-up but never finished (so never used): start over with these details.
    const updated = await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: metadata });
    if (updated.error) {
      console.error('[auth] updateUser failed:', updated.error.code || '', updated.error.message);
      throw new HttpError(400, "We couldn't create your account. Please try again.");
    }
    user = existing;
  } else {
    user = created.data.user;
  }

  const recoveryKey = await recovery.issueKey(email, user.id);
  res.status(201).json({ status: 'registered', email, recoveryKey });
}));

// Accounts left unverified by the old email sign-up: the right password proves they are the owner's.
router.post('/activate', activateLimit, wrap(async (req, res) => {
  const email = emailOf(req);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!EMAIL_RE.test(email) || !password) throw new HttpError(400, 'Enter your email and password.');
  const result = await passwordCheck.checkPassword(email, password);
  if (result === 'wrong') throw new HttpError(401, 'Incorrect email or password.');
  const user = await findUserByEmail(email);
  if (!user) throw new HttpError(401, 'Incorrect email or password.');
  if (!user.email_confirmed_at) {
    const confirmed = await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
    if (confirmed.error) {
      console.error('[auth] could not activate user:', confirmed.error.code || '', confirmed.error.message);
      throw new HttpError(503, "We couldn't activate your account. Please try again.");
    }
  }
  const { hasKey } = await recovery.status(email);
  const recoveryKey = hasKey ? null : await recovery.issueKey(email, user.id);
  res.json({ activated: true, email, ...(recoveryKey ? { recoveryKey } : {}) });
}));

// Forgot password: email + recovery key + new password.
router.post('/recover', recoverLimit, wrap(async (req, res) => {
  const email = emailOf(req);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  checkPasswordRules(password);
  try {
    const { userId, consumedHash } = await recovery.verifyKey(email, req.body?.recoveryKey);
    const updated = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (updated.error) {
      await recovery.restoreKey(email, consumedHash); // the same key can be used again
      if (updated.error.code === 'weak_password') throw new HttpError(400, updated.error.message || 'That password is too weak.');
      console.error('[auth] password reset failed:', updated.error.code || '', updated.error.message);
      throw new HttpError(503, "We couldn't change your password. Please try again.");
    }
    // The used key is gone; the account gets a new one, shown once.
    const recoveryKey = await recovery.issueKey(email, userId);
    res.json({ reset: true, email, recoveryKey });
  } catch (err) {
    sendError(res, err);
  }
}));

router.get('/recovery-key', requireAuth, wrap(async (req, res) => {
  res.json(await recovery.status(req.user.email));
}));

// A new key for a logged-in owner (lost the old one, or an account from before recovery keys).
router.post('/recovery-key', requireAuth, keyLimit, wrap(async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) throw new HttpError(400, 'Enter your password to create a new recovery key.');
  const result = await passwordCheck.checkPassword(req.user.email, password);
  if (result !== 'ok') throw new HttpError(401, 'That password is not correct.');
  const recoveryKey = await recovery.issueKey(req.user.email, req.user.id);
  res.json({ recoveryKey });
}));

module.exports = router;
