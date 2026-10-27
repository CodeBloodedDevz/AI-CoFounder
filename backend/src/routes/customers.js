const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, ok, validateIdParam } = require('../lib/http');
const { createCustomer, updateCustomer, deleteCustomer } = require('../lib/records');

// The rules for customers (phone / email checks) live in lib/records.js, shared with the admin portal.
const router = express.Router();
router.use(requireAuth, requireBusiness);
router.param('id', validateIdParam);

// GET /customers
router.get('/', wrap(async (req, res) => {
  res.json(ok(await supabase.from('customers').select('*').eq('business_id', req.business.id).order('name')));
}));

// POST /customers  -> mirrors addCustomer(customer)
router.post('/', wrap(async (req, res) => {
  res.json(await createCustomer(req.business.id, req.body || {}));
}));

// PUT /customers/:id  -> mirrors updateCustomer(customerId, customer)
router.put('/:id', wrap(async (req, res) => {
  res.json(await updateCustomer(req.business.id, req.params.id, req.body || {}));
}));

// DELETE /customers/:id  -> mirrors deleteCustomer(customerId), which also
// clears customerId off any upcoming_work rows pointing at them.
router.delete('/:id', wrap(async (req, res) => {
  await deleteCustomer(req.business.id, req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
