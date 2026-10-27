// Converts database rows (snake_case, numerics that may arrive as strings)
// into the camelCase shapes that aiEngine.js expects. These mirror the
// fromApi* helpers in the app's AppContext.js, so the server-side AI sees
// exactly the same data shapes the screens do.

const { normalizeCurrency } = require('./currency');
const { preferredLanguage } = require('./languages');

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toBusiness = (r) =>
  r
    ? {
        id: r.id,
        name: r.name,
        type: r.type,
        businessModel: r.business_model,
        currency: normalizeCurrency(r.currency),
        products: r.products_text,
        location: r.location,
        hours: r.hours,
        goals: r.goals,
        language: preferredLanguage(r.language), // only English / Afrikaans / isiZulu; anything else -> null
      }
    : null;

const toProduct = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  stock: num(r.stock),
  lowStockThreshold: num(r.low_stock_threshold),
  price: num(r.price),
  cost: num(r.cost),
});

const toService = (r) => ({
  id: r.id,
  name: r.name,
  price: num(r.price),
  duration: r.duration,
  category: r.category,
});

const toCustomer = (r) => ({
  id: r.id,
  name: r.name,
  phone: r.phone || '',
  email: r.email || '',
});

const toWork = (r) => ({
  id: r.id,
  title: r.title,
  service: r.service,
  customerId: r.customer_id || '',
  date: r.date,
  time: r.time,
  status: r.status,
  completedAt: r.completed_at || null,
  price: r.price == null ? null : num(r.price),
  reminders: Array.isArray(r.reminders) ? r.reminders : [],
  rescheduledFrom: r.rescheduled_from || null,
  rescheduleCount: num(r.reschedule_count),
  notes: r.notes || '',
});

const toTransaction = (r) => ({
  id: r.id,
  type: r.type,
  product: r.product,
  title: r.title,
  quantity: num(r.quantity),
  amount: num(r.amount),
  date: r.date,
  note: r.note,
  source: r.source || 'manual',
  bookingId: r.booking_id || null,
  customerId: r.customer_id || null,
  bookingPrice: r.booking_price == null ? null : num(r.booking_price),
});

module.exports = { toBusiness, toProduct, toService, toCustomer, toWork, toTransaction };
