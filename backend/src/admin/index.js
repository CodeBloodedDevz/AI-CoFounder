// The admin portal's API (ai-cofounder-admin), mounted by server.js at /admin-api.
//
// It runs inside this same backend so the portal reuses the app's own rules and data instead of a
// second system: one database, one set of business rules, one place that holds the secret keys.
// The phone app's routes are untouched; nothing here is reachable without an admin login.
//
//   /admin-api/auth/admin/*   sign in / session / own profile           (admin/auth.js)
//   /admin-api/admin/*        everything else, admins only               (overview, users, billing, sponsored)

const express = require('express');
const { router: authRouter, requireAdmin } = require('./auth');

const router = express.Router();

router.use('/auth/admin', authRouter);
router.use('/admin', requireAdmin, require('./overview'), require('./users'), require('./billing'), require('./sponsored'));

// Unknown admin route: a clear JSON 404 (the app's 404 handler comes after this).
router.use((req, res) => res.status(404).json({ error: `No admin API route for ${req.method} ${req.originalUrl.split('?')[0]}.` }));

module.exports = router;
