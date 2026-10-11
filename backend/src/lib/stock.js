const supabase = require('../supabaseClient');
const { escapeLike, dbError } = require('./http');

/** Finds a product by name for this business, ignoring upper/lower case. Returns the row or null. */
async function findProductByName(businessId, name) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('business_id', businessId)
    .ilike('name', escapeLike(name))
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw dbError(error);
  return data?.[0] || null;
}

/**
 * Adds `delta` (negative to sell) to a product's stock, never going below 0.
 *
 * Uses the adjust_product_stock() database function (see
 * supabase/migrations/001_hardening.sql) so two phones selling at the same
 * moment can't overwrite each other's count. If the migration hasn't been run
 * yet it quietly falls back to read-then-write, so nothing breaks.
 */
async function adjustStock(businessId, product, delta) {
  const { data, error } = await supabase.rpc('adjust_product_stock', {
    p_business_id: businessId,
    p_product_id: product.id,
    p_delta: delta,
  });
  if (!error) return Array.isArray(data) ? data[0] || null : data || null;

  const functionMissing = error.code === 'PGRST202' || /could not find the function/i.test(error.message || '');
  if (!functionMissing) throw dbError(error);

  const next = Math.max(0, Number(product.stock || 0) + delta);
  const res = await supabase
    .from('products')
    .update({ stock: next })
    .eq('id', product.id)
    .eq('business_id', businessId)
    .select()
    .maybeSingle();
  if (res.error) throw dbError(res.error);
  return res.data;
}

module.exports = { findProductByName, adjustStock };
