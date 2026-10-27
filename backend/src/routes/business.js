const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');
const { wrap, ok, badRequest } = require('../lib/http');
const { withCleanCurrency, businessFields } = require('../lib/records');

const router = express.Router();

// GET /business  -> mirrors reading state.business
router.get('/', requireAuth, (req, res) => {
  res.json(withCleanCurrency(req.business));
});

// withCleanCurrency and businessFields (the form rules) live in lib/records.js, shared with the admin portal.

// PUT /business  -> mirrors saveBusiness(form) in AppContext.
// Creates the row the first time (BusinessSetupScreen), updates it after.
router.put('/', requireAuth, wrap(async (req, res) => {
  const fields = businessFields(req.body);

  // A business must have a name. A blank name is refused when creating; when updating it is
  // ignored, so an old record (or a settings change like language) can't wipe a saved name.
  if (fields.name === '') {
    if (!req.business) throw badRequest('Please enter your business name.');
    if (req.business.name) throw badRequest('Business name cannot be empty.');
    delete fields.name;
  }
  if (!req.business && !fields.name) throw badRequest('Please enter your business name.');

  const update = async (id) => {
    if (!Object.keys(fields).length) return req.business;
    return ok(await supabase.from('businesses').update(fields).eq('id', id).select().single());
  };

  if (req.business) return res.json(withCleanCurrency(await update(req.business.id)));

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
      if (rows?.[0]) return res.json(withCleanCurrency(await update(rows[0].id)));
    }
    ok({ data: null, error });
  }
  res.json(withCleanCurrency(data));
}));

module.exports = router;
