// Business Analytics: real figures for "This week", "This month" and "This year", worked out from the
// recorded transactions. Pure functions (no React) so they can be tested.
//
//   week  = Monday of this week .. today, one point per day
//   month = the 1st of this month .. today, one point per week (1–7, 8–14, ...)
//   year  = 1 January .. today, one point per month
//
// Each period is compared with the SAME number of days just before it (e.g. Mon–Wed of last week),
// so a half-finished week is never compared with a whole one.
import { tr, money } from '../i18n/current';
import { addDays, dayShort, monthShort, parseISO, toISO, todayISO } from './schedule';
import { summarise, topSellingProducts } from './aiEngine';

export const RANGES = ['week', 'month', 'year'];

const dayOf = (t) => String(t?.date || '').slice(0, 10);
const daysBetween = (fromIso, toIso) => Math.round((parseISO(toIso) - parseISO(fromIso)) / 86_400_000);

/** Transactions dated from..to (both "YYYY-MM-DD", inclusive). */
export function transactionsBetween(transactions, from, to) {
  return (transactions || []).filter((t) => {
    const d = dayOf(t);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from && d <= to;
  });
}

/** { from, to, prevFrom, prevTo, buckets: [{ label, from, to }] } for a range, ending today. */
export function periodBounds(range, now = new Date()) {
  const today = todayISO(now);
  const d = parseISO(today);
  let from;
  const buckets = [];

  if (range === 'year') {
    from = toISO(d.getFullYear(), 0, 1);
    for (let m = 0; m <= d.getMonth(); m++) {
      const start = toISO(d.getFullYear(), m, 1);
      const end = m === d.getMonth() ? today : toISO(d.getFullYear(), m, new Date(d.getFullYear(), m + 1, 0).getDate());
      buckets.push({ label: monthShort(m), from: start, to: end });
    }
  } else if (range === 'month') {
    from = toISO(d.getFullYear(), d.getMonth(), 1);
    for (let day = 1; day <= d.getDate(); day += 7) {
      const last = Math.min(day + 6, d.getDate());
      buckets.push({ label: day === last ? String(day) : `${day}–${last}`, from: toISO(d.getFullYear(), d.getMonth(), day), to: toISO(d.getFullYear(), d.getMonth(), last) });
    }
  } else {
    const sinceMonday = (d.getDay() + 6) % 7;
    from = addDays(today, -sinceMonday);
    for (let i = 0; i <= sinceMonday; i++) {
      const iso = addDays(from, i);
      buckets.push({ label: dayShort(parseISO(iso).getDay()), from: iso, to: iso });
    }
  }

  const length = daysBetween(from, today) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -length);
  return { from, to: today, prevFrom, prevTo, buckets };
}

const pctChange = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/**
 * Everything the Analytics screen shows for one range.
 * -> { summary, previous, salesChangePct, trend, top, hasData, insight, bounds }
 *   trend: one point per day / week / month of the range:
 *     { label, from, to, income, expenses, profit, value }
 *     income   = recorded sales (booking income included), expenses = recorded expenses,
 *     profit   = income - expenses (negative for a loss), value = income (kept for older callers)
 */
export function analyticsFor(transactions, range = 'week', now = new Date()) {
  const bounds = periodBounds(range, now);
  const current = transactionsBetween(transactions, bounds.from, bounds.to);
  const before = transactionsBetween(transactions, bounds.prevFrom, bounds.prevTo);
  const summary = summarise(current);
  const previous = summarise(before);
  // The same rules as the totals (summarise), per bucket, so the graph always adds up to the cards.
  const trend = bounds.buckets.map((b) => {
    const s = summarise(transactionsBetween(current, b.from, b.to));
    return { label: b.label, from: b.from, to: b.to, income: s.totalSales, expenses: s.totalExpenses, profit: s.profit, value: s.totalSales };
  });
  const top = topSellingProducts(current, 5);
  const salesChangePct = pctChange(summary.totalSales, previous.totalSales);
  return { summary, previous, salesChangePct, trend, top, hasData: current.length > 0, insight: periodInsight({ summary, top, salesChangePct, range }), bounds };
}

/** One plain-language sentence about the period. */
export function periodInsight({ summary, top, salesChangePct, range }) {
  const period = tr(`analytics.period.${range}`);
  if (!summary.totalSales && !summary.totalExpenses) return tr('analytics.insightNothing', { period });
  if (!summary.totalSales) return tr('analytics.insightNoSales', { period, expenses: money(summary.totalExpenses) });
  const parts = [];
  if (top[0]) parts.push(tr('analytics.insightTop', { name: top[0].name, amount: money(top[0].value), period }));
  if (salesChangePct === null) parts.push(tr('analytics.insightNoCompare'));
  else if (salesChangePct > 0) parts.push(tr('analytics.insightUp', { pct: salesChangePct }));
  else if (salesChangePct < 0) parts.push(tr('analytics.insightDown', { pct: Math.abs(salesChangePct) }));
  else parts.push(tr('analytics.insightFlat'));
  if (summary.profit < 0) parts.push(tr('analytics.insightLoss', { amount: money(Math.abs(summary.profit)) }));
  return parts.join(' ');
}
