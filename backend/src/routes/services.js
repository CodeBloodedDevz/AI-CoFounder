const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, ok, validateIdParam } = require('../lib/http');
const { createService, updateService, deleteService } = require('../lib/records');

// The rules for services live in lib/records.js, shared with the admin portal.
const router = express.Router();
router.use(requireAuth, requireBusiness);
router.param('id', validateIdParam);

// GET /services
router.get('/', wrap(async (req, res) => {
  res.json(ok(await supabase.from('services').select('*').eq('business_id', req.business.id).order('name')));
}));

// POST /services  -> mirrors addService(service)
router.post('/', wrap(async (req, res) => {
  res.json(await createService(req.business.id, req.body || {}));
}));

// PUT /services/:id  -> mirrors updateService(serviceId, service)
// Partial: PricingAssistant sends only { price }.
router.put('/:id', wrap(async (req, res) => {
  res.json(await updateService(req.business.id, req.params.id, req.body || {}));
}));

// DELETE /services/:id
router.delete('/:id', wrap(async (req, res) => {
  await deleteService(req.business.id, req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
