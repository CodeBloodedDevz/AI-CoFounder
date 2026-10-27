// Income from completed bookings.
//
// Completing a booking records ONE income transaction for it (type 'sale', source 'booking'), linked by
// transactions.booking_id (unique in the database), with the customer and the agreed booking price.
//   - Completing again, refreshing or editing the booking finds the existing transaction: never a second one.
//   - Undoing the completion removes that automatic income (the visit didn't happen).
//   - The transaction can be edited afterwards (a tip, a correction); the booking's own price is not touched.
// Bookings without a price (no price set and no matching service price) are completed without income, and the
// app asks the user to record the payment. A database where schema.sql has not been run again lacks the link
// columns: completion then still works, without automatic income, and says so.

const supabase = require('../supabaseClient');
const { ok, parseNumber, todayInSA } = require('./http');

let linking = true;
const missingColumn = (e) => e && (e.code === 'PGRST204' || e.code === '42703' || /column .*(does not exist|schema cache)/i.test(e.message || ''));
const round2 = (n) => Math.round(n * 100) / 100;

/** The booking's agreed price; older bookings without one use the service's current price. 0 when unknown. */
async function bookingPrice(businessId, booking) {
  const own = parseNumber(booking.price);
  if (own !== null && own > 0) return round2(own);
  if (!booking.service) return 0;
  const rows = ok(await supabase.from('services').select('*').eq('business_id', businessId));
  const s = (rows || []).find((r) => String(r.name).trim().toLowerCase() === String(booking.service).trim().toLowerCase());
  const p = s ? parseNumber(s.price) : null;
  return p !== null && p > 0 ? round2(p) : 0;
}

async function findIncome(businessId, bookingId) {
  const res = await supabase.from('transactions').select('*').eq('business_id', businessId).eq('booking_id', bookingId);
  if (res.error) {
    if (missingColumn(res.error)) {
      linking = false;
      console.warn('[bookings] transactions.booking_id is missing: run backend/supabase/schema.sql again to record income from completed bookings.');
      return { unavailable: true };
    }
    ok(res);
  }
  return { row: (res.data || [])[0] || null };
}

/**
 * Makes sure a completed booking has its income transaction.
 *  -> { transaction, created: true|false } | { skipped: 'no_price' | 'migration_needed' }
 * Throws when the database refuses the write (the caller then leaves the booking as it was).
 */
async function ensureIncome(businessId, booking) {
  if (!linking) return { skipped: 'migration_needed' };
  const found = await findIncome(businessId, booking.id);
  if (found.unavailable) return { skipped: 'migration_needed' };
  if (found.row) return { transaction: found.row, created: false };

  const price = await bookingPrice(businessId, booking);
  if (!(price > 0)) return { skipped: 'no_price' };

  let customerName = '';
  if (booking.customer_id) {
    const c = ok(await supabase.from('customers').select('name').eq('id', booking.customer_id).eq('business_id', businessId).maybeSingle());
    customerName = c?.name || '';
  }
  const label = booking.service || booking.title || 'Booking';
  const today = todayInSA();
  const row = {
    business_id: businessId,
    type: 'sale',
    product: label,
    title: customerName ? `${label} – ${customerName}` : label,
    quantity: 1,
    amount: price,
    date: booking.date && booking.date <= today ? booking.date : today,
    note: `Completed booking${booking.time ? ` at ${booking.time}` : ''}`,
    booking_id: booking.id,
    customer_id: booking.customer_id || null,
    source: 'booking',
    booking_price: price,
  };
  const res = await supabase.from('transactions').insert(row).select().single();
  if (res.error) {
    if (missingColumn(res.error)) {
      linking = false;
      return { skipped: 'migration_needed' };
    }
    // Two requests completing the same booking at once: the unique index lets only one through.
    if (res.error.code === '23505') {
      const again = await findIncome(businessId, booking.id);
      if (again.row) return { transaction: again.row, created: false };
    }
    ok(res); // throws a clean error
  }
  return { transaction: res.data, created: true };
}

/** Removes the automatic income of a booking (completion undone). -> [removed transaction ids] */
async function removeIncome(businessId, bookingId) {
  if (!linking) return [];
  const found = await findIncome(businessId, bookingId);
  if (!found.row || found.row.source !== 'booking') return [];
  ok(await supabase.from('transactions').delete().eq('id', found.row.id).eq('business_id', businessId));
  return [found.row.id];
}

const isLinkingAvailable = () => linking;
const _resetForTests = () => {
  linking = true;
};

module.exports = { ensureIncome, removeIncome, bookingPrice, isLinkingAvailable, _resetForTests };
