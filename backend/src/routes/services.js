const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, ok, badRequest, notFound, cleanText, parseNumber, validateIdParam } = require('../lib/http');

const router = express.Router();
router.use(requireAuth, requireBusiness);
router.param('id', validateIdParam);

const price = (v) => {
  const n = parseNumber(v);
  if (n === null || n < 0) throw badRequest('Price must be a number, 0 or more.');
  return n;
};

// GET /services
router.get('/', wrap(async (req, res) => {
  res.json(ok(await supabase.from('services').select('*').eq('business_id', req.business.id).order('name')));
}));

// POST /services  -> mirrors addService(service)
router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const name = cleanText(b.name, 120);
  if (!name) throw badRequest('Service name is required.');
  const row = {
    business_id: req.business.id,
    name,
    price: b.price === undefined || b.price === '' || b.price === null ? 0 : price(b.price),
    duration: cleanText(b.duration, 60) ?? null,
    category: cleanText(b.category, 60) || 'General',
  };
  res.json(ok(await supabase.from('services').insert(row).select().single()));
}));

// PUT /services/:id  -> mirrors updateService(serviceId, service)
// Partial: PricingAssistant sends only { price }.
router.put('/:id', wrap(async (req, res) => {
  const b = req.body || {};
  const fields = {};
  if (b.name !== undefined) {
    const name = cleanText(b.name, 120);
    if (!name) throw badRequest('Service name is required.');
    fields.name = name;
  }
  if (b.price !== undefined) fields.price = price(b.price);
  if (b.duration !== undefined) fields.duration = cleanText(b.duration, 60) || null;
  if (b.category !== undefined) fields.category = cleanText(b.category, 60) || 'General';

  const q = supabase.from('services');
  const data = Object.keys(fields).length
    ? ok(await q.update(fields).eq('id', req.params.id).eq('business_id', req.business.id).select().maybeSingle())
    : ok(await q.select('*').eq('id', req.params.id).eq('business_id', req.business.id).maybeSingle());
  if (!data) throw notFound('Service not found.');
  res.json(data);
}));

// DELETE /services/:id
router.delete('/:id', wrap(async (req, res) => {
  ok(await supabase.from('services').delete().eq('id', req.params.id).eq('business_id', req.business.id));
  res.json({ ok: true });
}));

module.exports = router;
