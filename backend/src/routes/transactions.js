const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, ok, validateIdParam } = require('../lib/http');
const { createTransaction, deleteTransaction, updateTransaction } = require('../lib/bookkeeping');

const router = express.Router();
router.use(requireAuth, requireBusiness);
router.param('id', validateIdParam);

// GET /transactions  -> mirrors state.transactions
router.get('/', wrap(async (req, res) => {
  res.json(ok(await supabase.from('transactions').select('*').eq('business_id', req.business.id).order('date', { ascending: false }).order('created_at', { ascending: false })));
}));

// POST /transactions  -> mirrors addTransaction(txn) in AppContext, including
// its side effect: a sale decrements matching product stock by name.
router.post('/', wrap(async (req, res) => {
  const { txn } = await createTransaction(req.business.id, req.body || {});
  res.json(txn);
}));

// PUT /transactions/:id  -> edit amount, description, item / category, date, note, quantity (audited)
router.put('/:id', wrap(async (req, res) => {
  res.json(await updateTransaction(req.business.id, req.params.id, req.body || {}));
}));

// DELETE /transactions/:id  -> deleteTransaction(id). A deleted sale puts its units back in stock.
router.delete('/:id', wrap(async (req, res) => {
  const { stock } = await deleteTransaction(req.business.id, req.params.id);
  res.json({ ok: true, stock });
}));

module.exports = router;
