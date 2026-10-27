// Admin sign-in for the admin portal, using the SAME Supabase Auth accounts as the app.
// Only accounts with an active row in public.admin_users get in (add one with `npm run admin:add`).
// That table can only be written with the service role key, so nobody can make themselves an admin.
//
//   POST  /auth/admin/login        { email, password }      -> { token, refreshToken, expiresAt, admin }
//   POST  /auth/admin/refresh      { refreshToken }         -> same shape (keeps a remembered session going)
//   GET   /auth/admin/me                                    -> admin
//   POST  /auth/admin/logout                                -> ends this session
//   PATCH /auth/admin/profile      { name }                 -> admin
//   POST  /auth/admin/password     { currentPassword, newPassword }
//   GET   /auth/admin/preferences  /  PUT { newUser, payment, system }

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../supabaseClient');
const { getUserForToken, isSuspended, clearAuthCache } = require('../middleware/auth');
const { checkPassword } = require('../lib/passwordCheck');
const { limit, envInt } = require('../lib/rateLimit');
const { wrap, ok, HttpError, badRequest, cleanText } = require('../lib/http');
const { writeAudit } = require('./audit');

const router = express.Router();

const ADMIN_COLUMNS = 'user_id, email, full_name, role, is_active, last_login_at, notification_prefs, notifications_seen_at';
const DEFAULT_PREFS = { newUser: true, payment: true, system: true };
const MIN_PASSWORD = 8;

const ip = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const emailOf = (req) => String(req.body?.email || '').trim().toLowerCase();
const MIN15 = 15 * 60_000;
const loginLimit = limit((req) => [
  { key: `adm:ip:${ip(req)}`, max: envInt('ADMIN_LOGIN_LIMIT_PER_15MIN', 20), windowMs: MIN15 },
  { key: `adm:em:${emailOf(req)}`, max: 10, windowMs: MIN15 },
]);

/** A short-lived client for signing in / refreshing, so the shared service-role client is never switched to a user. */
const authClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

function tableMissing(error) {
  return error && (error.code === 'PGRST205' || error.code === '42P01' || /admin_users/.test(error.message || '') && /does not exist|could not find/i.test(error.message || ''));
}

async function activeAdminRow(userId) {
  const { data, error } = await supabase.from('admin_users').select(ADMIN_COLUMNS).eq('user_id', userId).eq('is_active', true).maybeSingle();
  if (tableMissing(error)) throw new HttpError(503, 'The admin tables are missing. Run backend/supabase/admin.sql in the Supabase SQL Editor.');
  return ok({ data, error });
}

const prefsOf = (row) => ({ ...DEFAULT_PREFS, ...(row?.notification_prefs && typeof row.notification_prefs === 'object' ? row.notification_prefs : {}) });

function toAdmin(user, row) {
  const meta = user?.user_metadata || {};
  return {
    id: user.id,
    name: row.full_name || meta.full_name || meta.name || String(user.email || '').split('@')[0],
    email: user.email,
    role: row.role,
    lastLoginAt: row.last_login_at || null,
    notificationPrefs: prefsOf(row),
  };
}

const sessionBody = (session, admin) => ({
  token: session.access_token,
  refreshToken: session.refresh_token,
  expiresAt: session.expires_at ? session.expires_at * 1000 : null,
  admin,
});

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/** Protects every admin route: a valid Supabase login token AND an active admin_users row. */
async function requireAdmin(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ error: 'Please sign in.', code: 'unauthorised' });
    const { data, error } = await getUserForToken(token);
    if (error || !data?.user) {
      if (error && (error.status >= 500 || error.name === 'AuthRetryableFetchError')) {
        return res.status(503).json({ error: 'The login service is temporarily unavailable. Please try again.' });
      }
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'session_expired' });
    }
    if (isSuspended(data.user)) return res.status(403).json({ error: 'This account is suspended.', code: 'account_suspended' });
    const row = await activeAdminRow(data.user.id);
    if (!row) return res.status(403).json({ error: 'Not an administrator.', code: 'not_admin' });
    req.admin = toAdmin(data.user, row);
    req.adminRow = row;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

/** Some actions (deleting a business's records) are for super admins only. */
const requireRole = (role) => (req, res, next) => {
  if (role === 'super_admin' && req.admin?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only a super admin can do that.', code: 'forbidden' });
  }
  next();
};

router.post('/login', loginLimit, wrap(async (req, res) => {
  const email = emailOf(req);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) throw badRequest('Email and password are required.');

  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    if (error && (error.status >= 500 || error.name === 'AuthRetryableFetchError')) {
      throw new HttpError(503, 'The login service is temporarily unavailable. Please try again.');
    }
    if (error?.code === 'user_banned' || /banned/i.test(error?.message || '')) throw new HttpError(403, 'This account is suspended.');
    if (error?.code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message || '')) {
      throw new HttpError(401, 'This account has not been confirmed yet. Confirm it in Supabase → Authentication → Users.');
    }
    throw new HttpError(401, 'Incorrect email or password.');
  }

  const row = await activeAdminRow(data.user.id);
  if (!row) {
    await supabase.auth.admin.signOut(data.session.access_token, 'local').catch(() => {});
    throw new HttpError(403, 'This account is not an administrator.');
  }
  const admin = toAdmin(data.user, row);
  await supabase.from('admin_users').update({ last_login_at: new Date().toISOString() }).eq('user_id', admin.id);
  await writeAudit(admin, { action: 'login', message: `${admin.email} signed in to the admin portal` });
  res.json(sessionBody(data.session, admin));
}));

router.post('/refresh', wrap(async (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
  if (!refreshToken) throw new HttpError(401, 'Please sign in again.');
  const { data, error } = await authClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  if (isSuspended(data.user)) throw new HttpError(403, 'This account is suspended.');
  const row = await activeAdminRow(data.user.id);
  if (!row) throw new HttpError(403, 'This account is not an administrator.');
  res.json(sessionBody(data.session, toAdmin(data.user, row)));
}));

router.get('/me', requireAdmin, (req, res) => res.json(req.admin));

router.post('/logout', requireAdmin, wrap(async (req, res) => {
  await supabase.auth.admin.signOut(req.token, 'local').catch(() => {});
  clearAuthCache();
  res.json({ ok: true });
}));

router.patch('/profile', requireAdmin, wrap(async (req, res) => {
  const name = cleanText(req.body?.name, 120);
  if (!name) throw badRequest('Please enter your name.');
  const row = ok(await supabase.from('admin_users').update({ full_name: name }).eq('user_id', req.admin.id).select(ADMIN_COLUMNS).single());
  await writeAudit(req.admin, { action: 'admin.profile', message: `${req.admin.email} changed their display name` });
  res.json({ ...req.admin, name: row.full_name, notificationPrefs: prefsOf(row) });
}));

router.post('/password', requireAdmin, wrap(async (req, res) => {
  const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!current) throw badRequest('Enter your current password.');
  if (next.length < MIN_PASSWORD) throw badRequest(`The new password must be at least ${MIN_PASSWORD} characters.`);
  if (next.length > 72) throw badRequest('The new password is too long (72 characters at most).');
  if (next === current) throw badRequest('The new password must be different from the current one.');
  const check = await checkPassword(req.admin.email, current);
  if (check !== 'ok') throw new HttpError(400, 'Your current password is not correct.');
  const { error } = await supabase.auth.admin.updateUserById(req.admin.id, { password: next });
  if (error) {
    if (error.code === 'weak_password') throw badRequest(error.message || 'That password is too weak.');
    console.error('[admin] password change failed:', error.message);
    throw new HttpError(503, "We couldn't change your password. Please try again.");
  }
  await writeAudit(req.admin, { action: 'admin.password', message: `${req.admin.email} changed their password` });
  res.json({ ok: true });
}));

router.get('/preferences', requireAdmin, (req, res) => res.json(prefsOf(req.adminRow)));

router.put('/preferences', requireAdmin, wrap(async (req, res) => {
  const prefs = { ...prefsOf(req.adminRow) };
  for (const key of Object.keys(DEFAULT_PREFS)) {
    if (req.body?.[key] !== undefined) {
      if (typeof req.body[key] !== 'boolean') throw badRequest(`${key} must be true or false.`);
      prefs[key] = req.body[key];
    }
  }
  ok(await supabase.from('admin_users').update({ notification_prefs: prefs }).eq('user_id', req.admin.id));
  res.json(prefs);
}));

module.exports = { router, requireAdmin, requireRole, prefsOf, DEFAULT_PREFS };
