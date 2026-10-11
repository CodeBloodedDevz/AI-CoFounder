const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, ok, badRequest, notFound, cleanText, isIsoDate, isUuid, validateIdParam } = require('../lib/http');

const router = express.Router();
router.use(requireAuth, requireBusiness);
router.param('id', validateIdParam);

const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'No-show'];

// Validates the fields that were sent and returns DB columns (only those sent).
async function buildFields(req, { partial }) {
  const b = req.body || {};
  const f = {};

  if (b.title !== undefined) f.title = cleanText(b.title, 160);
  if (b.service !== undefined) f.service = cleanText(b.service, 120);
  if (b.time !== undefined) f.time = cleanText(b.time, 20) || null;

  if (b.date !== undefined && b.date !== null && b.date !== '') {
    if (!isIsoDate(b.date)) throw badRequest('Date must be written YYYY-MM-DD.');
    f.date = b.date;
  } else if (b.date !== undefined) {
    f.date = null;
  }

  if (b.status !== undefined && b.status !== null && b.status !== '') {
    if (!STATUSES.includes(b.status)) throw badRequest(`Status must be one of: ${STATUSES.join(', ')}.`);
    f.status = b.status;
  } else if (!partial) {
    f.status = 'Pending';
  }

  if (b.customerId !== undefined) {
    if (!b.customerId) {
      f.customer_id = null; // '' / null means "no customer"
    } else {
      if (!isUuid(b.customerId)) throw badRequest('That customer does not exist.');
      const found = ok(
        await supabase.from('customers').select('id').eq('id', b.customerId).eq('business_id', req.business.id).maybeSingle()
      );
      if (!found) throw badRequest('That customer does not exist.');
      f.customer_id = b.customerId;
    }
  } else if (!partial) {
    f.customer_id = null;
  }
  return f;
}

// GET /work  -> mirrors state.upcomingWork
router.get('/', wrap(async (req, res) => {
  res.json(ok(await supabase.from('upcoming_work').select('*').eq('business_id', req.business.id).order('date')));
}));

// POST /work  -> mirrors addUpcomingWork(work)
router.post('/', wrap(async (req, res) => {
  const fields = await buildFields(req, { partial: false });
  res.json(ok(await supabase.from('upcoming_work').insert({ business_id: req.business.id, ...fields }).select().single()));
}));

// PUT /work/:id  -> mirrors updateUpcomingWork(workId, work). Only sent fields change.
router.put('/:id', wrap(async (req, res) => {
  const fields = await buildFields(req, { partial: true });
  const q = supabase.from('upcoming_work');
  const data = Object.keys(fields).length
    ? ok(await q.update(fields).eq('id', req.params.id).eq('business_id', req.business.id).select().maybeSingle())
    : ok(await q.select('*').eq('id', req.params.id).eq('business_id', req.business.id).maybeSingle());
  if (!data) throw notFound('Work item not found.');
  res.json(data);
}));

// DELETE /work/:id
router.delete('/:id', wrap(async (req, res) => {
  ok(await supabase.from('upcoming_work').delete().eq('id', req.params.id).eq('business_id', req.business.id));
  res.json({ ok: true });
}));

module.exports = router;
