const express = require('express');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { wrap, ok, badRequest, notFound, parseNumber, validateIdParam } = require('../lib/http');
const { restockProduct, updateProduct } = require('../lib/bookkeeping');
const { deleteProduct } = require('../lib/records');

const router = express.Router();
router.use(requireAuth, requireBusiness);
router.param('id', validateIdParam);

// GET /products  -> mirrors state.products
router.get('/', wrap(async (req, res) => {
  res.json(ok(await supabase.from('products').select('*').eq('business_id', req.business.id).order('name')));
}));

// DELETE /products/:id  -> mirrors deleteProduct(productId)
router.delete('/:id', wrap(async (req, res) => {
  await deleteProduct(req.business.id, req.params.id);
  res.json({ ok: true });
}));

// PUT /products/:id  -> updateProduct(productId, fields): name, category, price, cost,
// lowStockThreshold and a stock-take correction. Only the fields sent are changed.
router.put('/:id', wrap(async (req, res) => {
  res.json(await updateProduct(req.business.id, req.params.id, req.body || {}));
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
  const { product, transaction } = await restockProduct(req.business.id, {
    name: req.body?.product,
    quantity: req.body?.quantity,
    amount: req.body?.amount,
  });
  res.json({ product, transaction });
}));

module.exports = router;
