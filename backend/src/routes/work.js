const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, ok, validateIdParam } = require('../lib/http');
const { createBooking, updateBooking } = require('../lib/bookings');
const { deleteBooking } = require('../lib/records');

// Bookings ("upcoming work"). All the rules (statuses, completing, missed, rescheduling, duplicates)
// live in lib/bookings.js so the AI assistant follows exactly the same ones.
const router = express.Router();
router.use(requireAuth, requireBusiness);
router.param('id', validateIdParam);

// GET /work  -> every booking of this business (history included), soonest first
router.get('/', wrap(async (req, res) => {
  res.json(ok(await supabase.from('upcoming_work').select('*').eq('business_id', req.business.id).order('date').order('time')));
}));

// POST /work  -> a new booking (needs a customer when made from the app)
router.post('/', wrap(async (req, res) => {
  res.json(await createBooking(req.business.id, req.body || {}, { requireCustomer: true }));
}));

// PUT /work/:id  -> change details, status (complete / missed / cancel / restore) or reschedule. Only sent fields change.
router.put('/:id', wrap(async (req, res) => {
  res.json(await updateBooking(req.business.id, req.params.id, req.body || {}));
}));

// DELETE /work/:id  -> removes a booking entirely (e.g. one made by mistake)
router.delete('/:id', wrap(async (req, res) => {
  await deleteBooking(req.business.id, req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
