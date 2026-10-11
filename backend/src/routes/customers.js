const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, ok, badRequest, notFound, cleanText, validateIdParam } = require('../lib/http');

const router = express.Router();
router.use(requireAuth, requireBusiness);
router.param('id', validateIdParam);

// GET /customers
router.get('/', wrap(async (req, res) => {
  res.json(ok(await supabase.from('customers').select('*').eq('business_id', req.business.id).order('name')));
}));

// POST /customers  -> mirrors addCustomer(customer)
router.post('/', wrap(async (req, res) => {
  const name = cleanText(req.body?.name, 120);
  if (!name) throw badRequest('Customer name is required.');
  const row = {
    business_id: req.business.id,
    name,
    phone: cleanText(req.body?.phone, 40) ?? null,
    email: cleanText(req.body?.email, 160) ?? null,
  };
  res.json(ok(await supabase.from('customers').insert(row).select().single()));
}));

// PUT /customers/:id  -> mirrors updateCustomer(customerId, customer)
router.put('/:id', wrap(async (req, res) => {
  const fields = {};
  if (req.body?.name !== undefined) {
    const name = cleanText(req.body.name, 120);
    if (!name) throw badRequest('Customer name is required.');
    fields.name = name;
  }
  if (req.body?.phone !== undefined) fields.phone = cleanText(req.body.phone, 40) || null;
  if (req.body?.email !== undefined) fields.email = cleanText(req.body.email, 160) || null;

  const q = supabase.from('customers');
  const data = Object.keys(fields).length
    ? ok(await q.update(fields).eq('id', req.params.id).eq('business_id', req.business.id).select().maybeSingle())
    : ok(await q.select('*').eq('id', req.params.id).eq('business_id', req.business.id).maybeSingle());
  if (!data) throw notFound('Customer not found.');
  res.json(data);
}));

// DELETE /customers/:id  -> mirrors deleteCustomer(customerId), which also
// clears customerId off any upcoming_work rows pointing at them.
router.delete('/:id', wrap(async (req, res) => {
  ok(await supabase.from('upcoming_work').update({ customer_id: null }).eq('customer_id', req.params.id).eq('business_id', req.business.id));
  ok(await supabase.from('customers').delete().eq('id', req.params.id).eq('business_id', req.business.id));
  res.json({ ok: true });
}));

module.exports = router;
