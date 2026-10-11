const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');
const { wrap, ok, badRequest, cleanText } = require('../lib/http');

const router = express.Router();
const MODELS = ['Product-based', 'Service-based', 'Hybrid'];

// GET /business  -> mirrors reading state.business
router.get('/', requireAuth, (req, res) => {
  res.json(req.business || null);
});

// Builds the column values from whatever the form sent (only defined fields).
function buildFields(body) {
  const b = body || {};
  const fields = {};
  const text = [
    ['name', 'name', 120],
    ['type', 'type', 120],
    ['currency', 'currency', 20],
    ['location', 'location', 200],
    ['hours', 'hours', 200],
    ['goals', 'goals', 1000],
    ['language', 'language', 40],
    ['products', 'products_text', 2000],
  ];
  for (const [from, to, max] of text) {
    const v = cleanText(b[from], max);
    if (v !== undefined) fields[to] = v;
  }
  if (b.businessModel !== undefined && b.businessModel !== null && b.businessModel !== '') {
    if (!MODELS.includes(b.businessModel)) throw badRequest(`businessModel must be one of: ${MODELS.join(', ')}.`);
    fields.business_model = b.businessModel;
  }
  return fields;
}

// PUT /business  -> mirrors saveBusiness(form) in AppContext.
// Creates the row the first time (BusinessSetupScreen), updates it after.
router.put('/', requireAuth, wrap(async (req, res) => {
  const fields = buildFields(req.body);

  const update = async (id) => {
    if (!Object.keys(fields).length) return req.business;
    return ok(await supabase.from('businesses').update(fields).eq('id', id).select().single());
  };

  if (req.business) return res.json(await update(req.business.id));

  const { data, error } = await supabase
    .from('businesses')
    .insert({ owner_id: req.user.id, ...fields })
    .select()
    .single();

  if (error) {
    // Two requests raced to create the first row: use the one that won.
    if (error.code === '23505') {
      const { data: rows } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', req.user.id)
        .order('created_at', { ascending: true })
        .limit(1);
      if (rows?.[0]) return res.json(await update(rows[0].id));
    }
    ok({ data: null, error });
  }
  res.json(data);
}));

module.exports = router;
