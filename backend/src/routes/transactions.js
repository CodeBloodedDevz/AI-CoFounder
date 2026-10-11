const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, ok, badRequest, cleanText, parseNumber, isIsoDate, todayInSA } = require('../lib/http');
const { findProductByName, adjustStock } = require('../lib/stock');

const router = express.Router();
router.use(requireAuth, requireBusiness);

// GET /transactions  -> mirrors state.transactions
router.get('/', wrap(async (req, res) => {
  res.json(ok(await supabase.from('transactions').select('*').eq('business_id', req.business.id).order('date', { ascending: false })));
}));

// POST /transactions  -> mirrors addTransaction(txn) in AppContext, including
// its side effect: a sale decrements matching product stock by name.
router.post('/', wrap(async (req, res) => {
  const b = req.body || {};

  if (b.type !== 'sale' && b.type !== 'expense') throw badRequest('type must be "sale" or "expense".');

  // Never silently save R0: a bad amount is an error the person can fix.
  const amount = parseNumber(b.amount);
  if (amount === null || amount <= 0) throw badRequest('Amount must be a number greater than 0.');

  const quantity = b.quantity === undefined || b.quantity === '' || b.quantity === null ? 1 : parseNumber(b.quantity);
  if (quantity === null || quantity <= 0) throw badRequest('Quantity must be a number greater than 0.');

  if (b.date !== undefined && b.date !== null && b.date !== '' && !isIsoDate(b.date)) {
    throw badRequest('Date must be written YYYY-MM-DD.');
  }

  const product = cleanText(b.product, 120) || undefined;
  const title = cleanText(b.title, 160) || undefined;
  const label = product || title;
  if (!label) throw badRequest('Say what it was for (product or title).');

  const txn = ok(
    await supabase
      .from('transactions')
      .insert({
        business_id: req.business.id,
        type: b.type,
        product: label,
        title: title ?? null,
        quantity,
        amount,
        date: b.date || todayInSA(),
        note: cleanText(b.note, 500) ?? null,
      })
      .select()
      .single()
  );

  if (b.type === 'sale') {
    // The sale is already recorded; a stock hiccup must not make the app think it failed.
    try {
      const match = await findProductByName(req.business.id, label);
      if (match) await adjustStock(req.business.id, match, -quantity);
    } catch (err) {
      console.error('[transactions] stock update failed:', err.message);
    }
  }

  res.json(txn);
}));

module.exports = router;
