const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, ok, badRequest, notFound, cleanText, parseNumber, todayInSA, validateIdParam } = require('../lib/http');
const { findProductByName, adjustStock } = require('../lib/stock');

const router = express.Router();
router.use(requireAuth, requireBusiness);
router.param('id', validateIdParam);

const round2 = (n) => Math.round(n * 100) / 100;

// GET /products  -> mirrors state.products
router.get('/', wrap(async (req, res) => {
  res.json(ok(await supabase.from('products').select('*').eq('business_id', req.business.id).order('name')));
}));

// DELETE /products/:id  -> mirrors deleteProduct(productId)
router.delete('/:id', wrap(async (req, res) => {
  ok(await supabase.from('products').delete().eq('id', req.params.id).eq('business_id', req.business.id));
  res.json({ ok: true });
}));

// PATCH /products/:id/price  -> mirrors updateProductPrice(productId, price)
router.patch('/:id/price', wrap(async (req, res) => {
  const price = parseNumber(req.body?.price);
  if (price === null || price <= 0) throw badRequest('Price must be a number greater than 0.');
  const data = ok(
    await supabase
      .from('products')
      .update({ price })
      .eq('id', req.params.id)
      .eq('business_id', req.business.id)
      .select()
      .maybeSingle()
  );
  if (!data) throw notFound('Product not found.');
  res.json(data);
}));

// POST /products/restock  -> mirrors addStock({ product, quantity, amount })
// Creates the product if it doesn't exist yet, or adds to its stock if it
// does — same upsert-by-name logic as the app, now shared by every device.
// The app may send quantity/amount as typed text ("50,5"), so we parse them here.
router.post('/restock', wrap(async (req, res) => {
  const name = cleanText(req.body?.product, 120);
  const quantity = parseNumber(req.body?.quantity);
  const amount = req.body?.amount === undefined || req.body?.amount === '' || req.body?.amount === null
    ? 0
    : parseNumber(req.body.amount);

  if (!name || quantity === null || quantity <= 0) {
    throw badRequest('product and quantity are required (quantity must be more than 0).');
  }
  if (amount === null || amount < 0) throw badRequest('Amount must be a number, 0 or more.');

  const unitCost = round2(amount / quantity);
  const existing = await findProductByName(req.business.id, name);

  let productRow;
  if (existing) {
    productRow = await adjustStock(req.business.id, existing, quantity);
    // Only touch cost when the user actually told us what they paid.
    if (amount > 0 && productRow) {
      productRow = ok(
        await supabase.from('products').update({ cost: unitCost }).eq('id', existing.id).eq('business_id', req.business.id).select().single()
      );
    }
    if (!productRow) throw notFound('Product not found.');
  } else {
    productRow = ok(
      await supabase
        .from('products')
        .insert({
          business_id: req.business.id,
          name,
          category: 'Other',
          stock: quantity,
          low_stock_threshold: 5,
          price: round2(unitCost * 1.25),
          cost: unitCost,
        })
        .select()
        .single()
    );
  }

  // Restocking is also logged as an expense transaction, same as the app.
  const txn = ok(
    await supabase
      .from('transactions')
      .insert({
        business_id: req.business.id,
        type: 'expense',
        product: existing ? existing.name : name,
        quantity,
        amount,
        date: todayInSA(),
      })
      .select()
      .single()
  );

  res.json({ product: productRow, transaction: txn });
}));

module.exports = router;
