import { analyticsFor, periodBounds, transactionsBetween } from './analytics';

// Wednesday 14 October 2026, mid-afternoon.
const NOW = new Date(2026, 9, 14, 15, 0, 0);
const sale = (date, amount, product = 'Bread') => ({ id: `${date}-${amount}-${product}`, type: 'sale', product, amount, quantity: 1, date });
const expense = (date, amount) => ({ id: `e-${date}-${amount}`, type: 'expense', product: 'Rent', amount, quantity: 1, date });

describe('periodBounds', () => {
  test('week runs from Monday to today and compares with the same days last week', () => {
    const b = periodBounds('week', NOW);
    expect(b.from).toBe('2026-10-12');
    expect(b.to).toBe('2026-10-14');
    expect(b.prevFrom).toBe('2026-10-09');
    expect(b.prevTo).toBe('2026-10-11');
    expect(b.buckets).toHaveLength(3);
  });
  test('month is split into weeks up to today', () => {
    const b = periodBounds('month', NOW);
    expect(b.from).toBe('2026-10-01');
    expect(b.buckets.map((x) => x.label)).toEqual(['1–7', '8–14']);
  });
  test('year has one point per month so far', () => {
    const b = periodBounds('year', NOW);
    expect(b.from).toBe('2026-01-01');
    expect(b.buckets).toHaveLength(10);
    expect(b.buckets[9].to).toBe('2026-10-14');
  });
});

describe('analyticsFor', () => {
  const txns = [
    sale('2026-10-12', 100),
    sale('2026-10-14', 50, 'Milk'),
    expense('2026-10-13', 30),
    sale('2026-10-10', 75), // last week, same weekday span
    sale('2026-09-30', 999), // last month
    sale('2025-12-31', 5000), // last year
  ];

  test('only counts the chosen period', () => {
    const week = analyticsFor(txns, 'week', NOW);
    expect(week.summary).toEqual({ totalSales: 150, totalExpenses: 30, profit: 120 });
    expect(week.trend.map((p) => p.value)).toEqual([100, 0, 50]);
    // Income, expenses and profit per day for the graph (profit can go below zero).
    expect(week.trend.map((p) => [p.from, p.income, p.expenses, p.profit])).toEqual([
      ['2026-10-12', 100, 0, 100],
      ['2026-10-13', 0, 30, -30],
      ['2026-10-14', 50, 0, 50],
    ]);
    expect(week.salesChangePct).toBe(100); // 150 vs 75
    const month = analyticsFor(txns, 'month', NOW);
    expect(month.summary.totalSales).toBe(225);
    const year = analyticsFor(txns, 'year', NOW);
    expect(year.summary.totalSales).toBe(1224);
    expect(year.top[0]).toEqual({ name: 'Bread', value: 1174 });
  });

  test('the graph adds up to the totals and follows edits and deletions', () => {
    const month = analyticsFor(txns, 'month', NOW);
    const sum = (k) => month.trend.reduce((n, p) => n + p[k], 0);
    expect([sum('income'), sum('expenses'), sum('profit')]).toEqual([month.summary.totalSales, month.summary.totalExpenses, month.summary.profit]);
    // An edited amount and a removed record show straight away (the screen recalculates from the list).
    const edited = txns.map((x) => (x.type === 'expense' ? { ...x, amount: 80 } : x)).filter((x) => x.product !== 'Milk');
    const after = analyticsFor(edited, 'week', NOW);
    expect(after.trend.map((p) => p.profit)).toEqual([100, -80, 0]);
    expect(after.summary).toEqual({ totalSales: 100, totalExpenses: 80, profit: 20 });
  });

  test('an empty period says so instead of inventing numbers', () => {
    const r = analyticsFor([], 'week', NOW);
    expect(r.hasData).toBe(false);
    expect(r.trend.every((p) => p.value === 0)).toBe(true);
    expect(r.salesChangePct).toBeNull();
    expect(typeof r.insight).toBe('string');
  });

  test('transactionsBetween ignores rows without a real date', () => {
    expect(transactionsBetween([{ date: null }, { date: 'soon' }, sale('2026-10-12', 1)], '2026-10-01', '2026-10-31')).toHaveLength(1);
  });
});
