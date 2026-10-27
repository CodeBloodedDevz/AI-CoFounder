// The business rules for the two writes that have side effects on stock.
// The REST routes (/products/restock, /transactions) and the AI assistant's
// tools (chat + Live Voice) all call these same functions, so a product added
// by voice follows exactly the same rules as one added from the Stock screen.

const supabase = require('../supabaseClient');
const { HttpError, ok, badRequest, notFound, cleanText, parseNumber, isIsoDate, todayInSA } = require('./http');
const { findProductByName, adjustStock } = require('./stock');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Adds stock for a product, creating the product when it doesn't exist yet,
 * and logs the purchase as an expense (same as the app's "Add stock").
 *   amount = TOTAL paid (0 / undefined = unknown)
 *   price  = optional selling price for a NEW product (default: cost + 25%)
 * Returns { product, transaction, created }.
 */
async function restockProduct(businessId, { name, quantity, amount = 0, price, category, lowStockThreshold }) {
  const cleanName = cleanText(name, 120);
  const qty = parseNumber(quantity);
  const total = amount === undefined || amount === '' || amount === null ? 0 : parseNumber(amount);

  if (!cleanName || qty === null || qty <= 0) {
    throw badRequest('product and quantity are required (quantity must be more than 0).');
  }
  if (total === null || total < 0) throw badRequest('Amount must be a number, 0 or more.');

  const unitCost = round2(total / qty);
  const existing = await findProductByName(businessId, cleanName);

  let productRow;
  if (existing) {
    productRow = await adjustStock(businessId, existing, qty);
    // Only touch cost when the user actually told us what they paid.
    if (total > 0 && productRow) {
      productRow = ok(
        await supabase.from('products').update({ cost: unitCost }).eq('id', existing.id).eq('business_id', businessId).select().single()
      );
    }
    if (!productRow) throw notFound('Product not found.');
  } else {
    const sell = price === undefined || price === null || price === '' ? null : parseNumber(price);
    if (sell !== null && sell < 0) throw badRequest('Selling price must be 0 or more.');
    const threshold = lowStockThreshold === undefined || lowStockThreshold === null || lowStockThreshold === '' ? null : parseNumber(lowStockThreshold);
    productRow = ok(
      await supabase
        .from('products')
        .insert({
          business_id: businessId,
          name: cleanName,
          category: cleanText(category, 60) || 'Other',
          stock: qty,
          low_stock_threshold: threshold !== null && threshold >= 0 ? threshold : 5,
          price: sell !== null ? sell : round2(unitCost * 1.25),
          cost: unitCost,
        })
        .select()
        .single()
    );
  }

  const txn = ok(
    await supabase
      .from('transactions')
      .insert({
        business_id: businessId,
        type: 'expense',
        product: existing ? existing.name : cleanName,
        quantity: qty,
        amount: total,
        date: todayInSA(),
      })
      .select()
      .single()
  );
  return { product: productRow, transaction: txn, created: !existing };
}

/**
 * Records a sale or an expense. A sale also takes the units off matching
 * stock. Returns { txn, stock: { product, before, after } | null }.
 */
async function createTransaction(businessId, b = {}) {
  if (b.type !== 'sale' && b.type !== 'expense') throw badRequest('type must be "sale" or "expense".');

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
        business_id: businessId,
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

  let stock = null;
  if (b.type === 'sale') {
    // The sale is already recorded; a stock hiccup must not make the app think it failed.
    try {
      const match = await findProductByName(businessId, label);
      if (match) {
        const after = await adjustStock(businessId, match, -quantity);
        stock = { product: match.name, before: Number(match.stock), after: after ? Number(after.stock) : null };
      }
    } catch (err) {
      console.error('[transactions] stock update failed:', err.message);
    }
  }
  return { txn, stock };
}

/**
 * Edits a product's details from the Stock screen. Only the fields that were sent change.
 *   { name, category, price, cost, lowStockThreshold, stock }
 * `stock` sets the count directly (a stock-take correction); it does not log an expense.
 * Returns the updated row. Throws 400 for bad values, 404 when it isn't this business's product,
 * 409 when another product already has the new name (names are how sales find their product).
 */
async function updateProduct(businessId, productId, b = {}) {
  const fields = {};
  if (b.name !== undefined) {
    const name = cleanText(b.name, 120);
    if (!name) throw badRequest('Product name is required.');
    const clash = await findProductByName(businessId, name);
    if (clash && clash.id !== productId) throw new HttpError(409, `You already have a product called "${clash.name}".`);
    fields.name = name;
  }
  if (b.category !== undefined) fields.category = cleanText(b.category, 60) || 'Other';
  const number = (key, column, { min = 0, label, above = false }) => {
    if (b[key] === undefined) return;
    const n = parseNumber(b[key]);
    if (n === null || n < min || (above && n <= min)) throw badRequest(`${label} must be a number ${above ? `greater than ${min}` : `of ${min} or more`}.`);
    fields[column] = column === 'stock' || column === 'low_stock_threshold' ? n : round2(n);
  };
  number('price', 'price', { label: 'Selling price', above: true });
  number('cost', 'cost', { label: 'Cost price' });
  number('lowStockThreshold', 'low_stock_threshold', { label: 'Low-stock level' });
  number('stock', 'stock', { label: 'Stock' });

  const q = supabase.from('products');
  const data = Object.keys(fields).length
    ? ok(await q.update(fields).eq('id', productId).eq('business_id', businessId).select().maybeSingle())
    : ok(await q.select('*').eq('id', productId).eq('business_id', businessId).maybeSingle());
  if (!data) throw notFound('Product not found.');
  return data;
}

/**
 * Deletes a recorded sale or expense. Deleting a SALE puts the units back on the matching
 * product (the opposite of what recording it did), so the stock count stays right.
 * Expenses never changed stock, so deleting one doesn't either.
 * Returns { deleted, stock: { product, after } | null }.
 */
async function deleteTransaction(businessId, transactionId) {
  const txn = ok(await supabase.from('transactions').select('*').eq('id', transactionId).eq('business_id', businessId).maybeSingle());
  if (!txn) throw notFound('Transaction not found.');
  ok(await supabase.from('transactions').delete().eq('id', transactionId).eq('business_id', businessId));

  let stock = null;
  // Income from a booking never took anything out of stock, so deleting it puts nothing back.
  if (txn.type === 'sale' && txn.source !== 'booking') {
    try {
      const match = await findProductByName(businessId, txn.product || txn.title || '');
      const qty = Number(txn.quantity) || 0;
      if (match && qty > 0) {
        const after = await adjustStock(businessId, match, qty);
        stock = { product: match.name, after: after ? Number(after.stock) : null };
      }
    } catch (err) {
      console.error('[transactions] stock restore failed:', err.message);
    }
  }
  return { deleted: txn, stock };
}

/**
 * Edits a recorded transaction (amount, description, category / item, date, note, quantity).
 * Its type and its link to a booking never change. Every edit is added to edit_history (audit trail).
 * Editing a manual product sale's item or quantity moves stock accordingly; booking income has no stock.
 * Returns the updated row.
 */
async function updateTransaction(businessId, id, b = {}) {
  const txn = ok(await supabase.from('transactions').select('*').eq('id', id).eq('business_id', businessId).maybeSingle());
  if (!txn) throw notFound('Transaction not found.');
  if (b.type !== undefined && b.type !== txn.type) throw badRequest("A transaction's type can't be changed. Delete it and record it again instead.");
  if (b.booking_id !== undefined || b.bookingId !== undefined) throw badRequest("A transaction's booking can't be changed.");

  const f = {};
  if (b.amount !== undefined) {
    const amount = parseNumber(b.amount);
    if (amount === null || amount <= 0) throw badRequest('Amount must be a number greater than 0.');
    if (amount > 100000000) throw badRequest('That amount is too large.');
    f.amount = round2(amount);
  }
  if (b.title !== undefined) f.title = cleanText(b.title, 160) || null;
  if (b.product !== undefined) f.product = cleanText(b.product, 120) || null;
  if (b.note !== undefined) f.note = cleanText(b.note, 500) || null;
  if (b.date !== undefined) {
    if (!isIsoDate(b.date)) throw badRequest('Date must be written YYYY-MM-DD.');
    if (b.date > todayInSA()) throw badRequest("A transaction can't be dated in the future.");
    f.date = b.date;
  }
  if (b.quantity !== undefined) {
    const q = parseNumber(b.quantity);
    if (q === null || q <= 0) throw badRequest('Quantity must be a number greater than 0.');
    f.quantity = q;
  }
  const merged = { ...txn, ...f };
  if (!merged.product && !merged.title) throw badRequest('Say what it was for (a description or an item).');
  if (!merged.product) f.product = merged.title;

  const changes = {};
  Object.keys(f).forEach((k) => {
    if (String(f[k] ?? '') !== String(txn[k] ?? '')) changes[k] = [txn[k] ?? null, f[k] ?? null];
  });
  if (!Object.keys(changes).length) return txn;

  // Remember the old values before writing (the row object may be updated in place).
  const old = { product: txn.product || txn.title || '', quantity: Number(txn.quantity) || 0, type: txn.type, source: txn.source };
  const history = Array.isArray(txn.edit_history) ? [...txn.edit_history] : [];
  const extra = { updated_at: new Date().toISOString(), edit_history: [...history, { at: new Date().toISOString(), changes }].slice(-50) };
  let res = await supabase.from('transactions').update({ ...f, ...extra }).eq('id', id).eq('business_id', businessId).select().maybeSingle();
  if (res.error && (res.error.code === 'PGRST204' || res.error.code === '42703')) {
    // Older database without the audit columns: save the edit itself.
    res = await supabase.from('transactions').update(f).eq('id', id).eq('business_id', businessId).select().maybeSingle();
  }
  const updated = ok(res);
  if (!updated) throw notFound('Transaction not found.');

  // Stock follows a manual product sale's item / quantity (booking income never touches stock).
  if (old.type === 'sale' && old.source !== 'booking' && (changes.product || changes.quantity)) {
    try {
      const before = await findProductByName(businessId, old.product);
      const after = await findProductByName(businessId, updated.product || updated.title || '');
      if (before) await adjustStock(businessId, before, old.quantity);
      if (after) {
        const fresh = before && after.id === before.id ? ok(await supabase.from('products').select('*').eq('id', after.id).maybeSingle()) : after;
        await adjustStock(businessId, fresh, -(Number(updated.quantity) || 0));
      }
    } catch (err) {
      console.error('[transactions] stock update after edit failed:', err.message);
    }
  }
  return updated;
}

module.exports = { restockProduct, createTransaction, updateProduct, deleteTransaction, updateTransaction, round2 };
