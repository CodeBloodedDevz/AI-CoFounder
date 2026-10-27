import { tr, money } from '../i18n/current';
import { dayLong, parseISO } from './schedule';

// "2026-10-18" is a calendar day, read in local time (new Date('2026-10-18') would be UTC midnight,
// which is the previous evening in some time zones). Full timestamps are read as they are.
const toDate = (value) => parseISO(String(value || '').slice(0, 10)) || new Date(value);
export function summarise(transactions) {
  const sales = transactions.filter((t) => t.type === 'sale');
  const expenses = transactions.filter((t) => t.type === 'expense');

  const totalSales = sales.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const profit = totalSales - totalExpenses;

  return { totalSales, totalExpenses, profit };
}

export function topSellingProducts(transactions, limit = 3) {
  const totals = {};
  transactions
    .filter((t) => t.type === 'sale')
    .forEach((t) => {
      totals[t.product] = (totals[t.product] || 0) + Number(t.amount || 0);
    });

  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

export function lowStockProducts(products) {
  return products.filter((p) => p.stock <= p.lowStockThreshold && p.stock > 0);
}

export function outOfStockProducts(products) {
  return products.filter((p) => p.stock <= 0);
}

export function stockStatus(product) {
  if (product.stock <= 0) return 'OUT';
  if (product.stock <= product.lowStockThreshold) return 'LOW';
  return 'GOOD';
}

/** Products that are low OR out of stock (both need restocking), most urgent first. */
export function stockNeedingAttention(products) {
  return [...outOfStockProducts(products || []), ...lowStockProducts(products || [])];
}

/**
 * Generates the "AI Co-Founder Insight" text shown on the dashboard.
 * `attention` is the list of products that need restocking (low or out of stock);
 * `products` (optional) is the whole list, so nothing is said about stock when there is none.
 */
export function dashboardInsight({ totalSales, totalExpenses, profit }, attention, products) {
  const marginPct = totalSales > 0 ? Math.round((profit / totalSales) * 100) : 0;
  const hasStock = products ? products.length > 0 : true;
  const stockNote = !hasStock
    ? ''
    : attention.length
    ? ` ${tr('ai.keepAnEye', { items: attention.slice(0, 4).map((p) => p.name).join(', ') })}`
    : ` ${tr('ai.stockHealthy')}`;

  // Nothing recorded yet: don't tell a new business that its expenses "outpace" R0 of sales.
  if (totalSales === 0 && totalExpenses === 0) return `${tr('ai.noDataYet')}${stockNote}`;

  if (profit <= 0) {
    return `${tr('ai.expensesOutpace', { amount: money(totalExpenses) })}${stockNote}`;
  }

  return `${tr('ai.marginLine', { pct: marginPct, profit: money(profit) })}${stockNote}`;
}


export function analyticsInsight(transactions) {
  const { totalSales, totalExpenses } = summarise(transactions);
  const top = topSellingProducts(transactions, 1)[0];

  if (!top) return tr('ai.recordFewSales');

  const salesGrowth = totalSales > totalExpenses ? tr('ai.trendingUp') : tr('ai.underPressure');

  return tr('ai.topProduct', { name: top.name, trend: salesGrowth });
}

/** Generates a one-line restock recommendation summary for the dashboard/insight card. */
export function restockRecommendation(products) {
  const low = lowStockProducts(products);
  const out = outOfStockProducts(products);

  if (!low.length && !out.length) {
    return tr('ai.allStocked');
  }

  const urgent = [...out, ...low].slice(0, 3).map((p) => p.name);
  return tr('ai.restockSoon', { items: urgent.join(', '), first: urgent[0] });
}

export function restockPlan(products, transactions) {
  const needsAttention = products.filter((p) => stockStatus(p) !== 'GOOD');

  return needsAttention
    .map((p) => {
      const unitsSoldRecently = transactions
        .filter((t) => t.type === 'sale' && t.product === p.name)
        .reduce((sum, t) => sum + Number(t.quantity || 0), 0);

      const demandBoost = unitsSoldRecently >= 8 ? 1.3 : unitsSoldRecently >= 3 ? 1.1 : 1.0;
      const target = Math.max(p.lowStockThreshold * 2, p.stock + 5);
      const suggestedQty = Math.ceil((target - p.stock) * demandBoost);

      return {
        id: p.id,
        name: p.name,
        currentStock: p.stock,
        status: stockStatus(p),
        suggestedQty: Math.max(suggestedQty, 1),
      };
    })
    .sort((a, b) => (a.status === 'OUT' ? -1 : 1) - (b.status === 'OUT' ? -1 : 1));
}

/**
 * Location-based pricing adjustment.
 * Cost of living / rent / foot-traffic differ a lot by region in South Africa,
 * so the AI price recommendation shouldn't be identical for a shop in
 * Johannesburg CBD and a shop in a small rural town. This looks at the
 * free-text business location the owner typed in BusinessSetup and applies
 * a location multiplier on top of the demand-based price.
 *
 * This is intentionally a simple if/else lookup (not a geocoding call) so it
 * works fully offline and is easy to extend with more towns later.
 */
export function locationPriceFactor(location) {
  const loc = (location || '').toLowerCase();

  if (loc.includes('cape town') || loc.includes('cpt') || loc.includes('camps bay') || loc.includes('sea point')) {
    return { factor: 1.08, area: 'Cape Town', areaKey: 'capeTown' };
  }
  if (
    loc.includes('sandton') ||
    loc.includes('johannesburg') ||
    loc.includes('joburg') ||
    loc.includes('jozi') ||
    loc.includes('jhb')
  ) {
    return { factor: 1.05, area: 'Johannesburg', areaKey: 'johannesburg' };
  }
  if (loc.includes('pretoria') || loc.includes('tshwane')) {
    return { factor: 1.03, area: 'Pretoria', areaKey: 'pretoria' };
  }
  if (loc.includes('durban') || loc.includes('umhlanga') || loc.includes('ethekwini')) {
    return { factor: 1.02, area: 'Durban', areaKey: 'durban' };
  }
  if (loc.includes('soweto') || loc.includes('township') || loc.includes('rural')) {
    return { factor: 0.94, area: 'a township/rural area', areaKey: 'township' };
  }

  return { factor: 1.0, area: null };
}

/** AI pricing recommendation for a single product, now location-aware. */
export function recommendPrice(product, transactions, business) {
  const sold = transactions.filter((t) => t.type === 'sale' && t.product === product.name);
  const unitsSold = sold.reduce((sum, t) => sum + Number(t.quantity || 0), 0);

  const margin = product.price > 0 ? (product.price - product.cost) / product.price : 0;
  const demandFactor = unitsSold >= 8 ? 1.12 : unitsSold >= 3 ? 1.06 : 1.0;

  const { factor: locationFactor, area: areaEn, areaKey } = locationPriceFactor(business?.location);
  const area = areaKey ? tr(`ai.${areaKey}`) : areaEn;

  let recommended = Math.round(product.price * demandFactor * locationFactor * 100) / 100;
  // Never suggest selling below what the product costs (a lower-cost area can pull the price down).
  const floor = product.cost > 0 ? Math.round(product.cost * 1.05 * 100) / 100 : 0;
  const keptAboveCost = recommended < floor;
  if (keptAboveCost) recommended = Math.max(floor, product.price);
  const marginPct = Math.round(margin * 100);

  let reason;
  if (demandFactor > 1) {
    reason = tr('ai.priceRaise', { name: product.name });
  } else {
    reason = tr('ai.priceHold', { name: product.name });
  }

  if (area && locationFactor > 1) {
    reason += ` ${tr('ai.areaHigher', { area })}`;
  } else if (area && locationFactor < 1) {
    reason += ` ${tr('ai.areaLower', { area })}`;
  }
  if (keptAboveCost) reason += ` ${tr('ai.keptAboveCost', { cost: money(product.cost) })}`;

  return {
    currentPrice: product.price,
    currentMarginPct: marginPct,
    recommendedPrice: recommended,
    reason,
    locationArea: area,
  };
}

/** Simple intent-matched replies for the AI Co-Founder chat quick-reply buttons. */
export function chatReply(intent, { transactions, products, services = [], upcomingWork = [], customers = [], business } = {}) {
  const { totalSales, totalExpenses, profit } = summarise(transactions);
  const low = lowStockProducts(products || []);

  switch (intent) {
    case 'analyse':
      return tr('ai.chatAnalyse', { sales: money(totalSales), expenses: money(totalExpenses), profit: money(profit) });
    case 'profit':
      return profit > 0
        ? tr('ai.chatProfitable', { profit: money(profit) })
        : tr('ai.chatLoss', { amount: money(Math.abs(profit)) });
    case 'restock':
      return low.length
        ? tr('ai.chatRestock', { items: low.map((p) => p.name).join(', ') })
        : tr('ai.chatNothingUrgent');
    case 'prices':
      return tr('ai.chatPrices');
    case 'busyHours':
      return recommendBusyHours(upcomingWork).insight;
    case 'retention': {
      const atRisk = recommendCustomerRetention(customers, upcomingWork, services);
      if (!atRisk.length) return tr('ai.chatNoRetention');
      return atRisk.slice(0, 3).map((c) => c.insight).join(' ');
    }
    case 'growth':
      return recommendBusinessGrowth(transactions).insight;
    case 'popularService': {
      const popular = serviceBookingCounts(upcomingWork)[0];
      return popular
        ? tr('ai.chatPopular', { name: popular.name, count: popular.count })
        : tr('ai.chatSchedulePopular');
    }
    default:
      return tr('ai.chatDefault');
  }
}

/* ---------- Service-based AI helpers ---------- */

/** Parses free-text durations like "45 minutes", "1 hour", "1.5 hours" into a minute count. */
export function parseDurationMinutes(duration) {
  const text = (duration || '').toLowerCase();
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minMatch = text.match(/(\d+(?:\.\d+)?)\s*m/);
  if (hourMatch || minMatch) {
    const hours = hourMatch ? parseFloat(hourMatch[1]) : 0;
    const mins = minMatch ? parseFloat(minMatch[1]) : 0;
    return Math.round(hours * 60 + mins);
  }
  const bare = text.match(/(\d+(?:\.\d+)?)/);
  return bare ? Math.round(parseFloat(bare[1])) : 60;
}

/** Rough operating-cost estimate for a service, based on how long it takes (labour + overhead). */
export function estimateServiceOperatingCost(duration) {
  const minutes = parseDurationMinutes(duration);
  const ratePerMinute = 0.9; // ≈ R54/hour of labour & overhead
  return Math.round(minutes * ratePerMinute);
}

/**
 * AI pricing recommendation for a single service. Mirrors recommendPrice(), but uses
 * completed bookings (from upcomingWork) as the demand signal instead of sales quantity,
 * and an estimated operating cost (from duration) instead of a stocked cost price —
 * matching the doc's "duration + operating cost → suggested price" example.
 */
export function recommendServicePrice(service, upcomingWork, business) {
  const bookings = (upcomingWork || []).filter((w) => w.service === service.name);
  const completedCount = bookings.filter((w) => w.status === 'Completed').length;

  const demandFactor = completedCount >= 8 ? 1.15 : completedCount >= 3 ? 1.08 : 1.0;
  const { factor: locationFactor, area: areaEn, areaKey } = locationPriceFactor(business?.location);
  const area = areaKey ? tr(`ai.${areaKey}`) : areaEn;

  const operatingCost = estimateServiceOperatingCost(service.duration);
  const durationMins = parseDurationMinutes(service.duration);
  const marginPct = service.price > 0 ? Math.round(((service.price - operatingCost) / service.price) * 100) : 0;
  const recommended = Math.round(service.price * demandFactor * locationFactor);

  let reason;
  if (demandFactor > 1) {
    reason = tr('ai.svcRaise', { name: service.name, mins: durationMins, cost: money(operatingCost) });
  } else if (marginPct < 30) {
    reason = tr('ai.svcThin', { name: service.name, mins: durationMins, cost: money(operatingCost) });
  } else {
    reason = tr('ai.svcHold', { name: service.name });
  }

  if (area && locationFactor > 1) reason += ` ${tr('ai.svcAreaHigher', { area })}`;
  else if (area && locationFactor < 1) reason += ` ${tr('ai.svcAreaLower', { area })}`;

  return {
    currentPrice: service.price,
    estimatedOperatingCost: operatingCost,
    currentMarginPct: marginPct,
    recommendedPrice: recommended,
    bookingsCount: completedCount,
    reason,
    locationArea: area,
  };
}

/** How many times each service has been booked — powers "Most popular service". Cancelled and missed
 *  bookings are left out: they didn't happen. */
export function serviceBookingCounts(upcomingWork) {
  const counts = {};
  (upcomingWork || []).forEach((w) => {
    if (!w.service || w.status === 'Cancelled' || w.status === 'No-show') return;
    counts[w.service] = (counts[w.service] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Which hours and weekdays get the most bookings, from upcomingWork's date/time fields. */
export function recommendBusyHours(upcomingWork) {
  const hourCounts = {};
  const dayCounts = {};

  (upcomingWork || []).forEach((w) => {
    if (w.status === 'Cancelled' || w.status === 'No-show') return; // only appointments that happen / will happen
    const hourMatch = /^(\d{1,2}):/.exec((w.time || '').trim());
    if (hourMatch) {
      const hour = parseInt(hourMatch[1], 10);
      if (hour >= 0 && hour <= 23) hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec((w.date || '').trim());
    if (dateMatch) {
      const d = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
      if (!Number.isNaN(d.getTime())) {
        const dayName = WEEKDAYS[d.getDay()];
        dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
      }
    }
  });

  const byHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]).map(([hour, count]) => ({ hour: Number(hour), count }));
  const byDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1]).map(([day, count]) => ({ day, count }));

  if (!byHour.length && !byDay.length) {
    return { byHour, byDay, insight: tr('ai.busyNone') };
  }

  const topDay = byDay[0];
  const topHour = byHour[0];
  const parts = [];
  const dayIdx = topDay ? WEEKDAYS.indexOf(topDay.day) : -1;
  const dayText = dayIdx >= 0 ? dayLong(dayIdx) : topDay?.day;
  if (topDay) parts.push(tr('ai.busyDay', { day: dayText, count: topDay.count }));
  if (topHour) parts.push(tr('ai.busyHour', { time: `${String(topHour.hour).padStart(2, '0')}:00` }));

  const insight = parts.length
    ? tr('ai.busySummary', { parts: parts.join(tr('ai.busyJoin')), around: topDay ? dayText : tr('ai.thatTime') })
    : tr('ai.busyNone');

  return { byHour, byDay, insight };
}

/** Per-customer visit count and lifetime spend, derived from completed work matched to services. */
export function customerStats(customer, upcomingWork, services) {
  const completedWork = (upcomingWork || []).filter((w) => w.customerId === customer.id && w.status === 'Completed');
  const visits = completedWork.length;
  const totalSpent = completedWork.reduce((sum, w) => {
    const service = (services || []).find((s) => s.name === w.service);
    return sum + (service ? Number(service.price || 0) : 0);
  }, 0);
  const lastVisitDate =
    completedWork
      .map((w) => w.date)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || null;

  return { visits, totalSpent, lastVisitDate };
}

/** Flags customers who haven't had a completed visit in a while, with a ready-to-use reminder line. */
export function recommendCustomerRetention(customers, upcomingWork, services, { staleAfterDays = 28, today = new Date() } = {}) {
  // Customers with an unfinished booking are not "at risk": they already have an appointment.
  const booked = new Set((upcomingWork || []).filter((w) => w.status === 'Pending' || w.status === 'Confirmed').map((w) => w.customerId));
  const atRisk = (customers || [])
    .map((customer) => {
      if (booked.has(customer.id)) return null;
      const stats = customerStats(customer, upcomingWork, services);
      if (!stats.lastVisitDate) return null;
      const last = toDate(stats.lastVisitDate);
      if (Number.isNaN(last.getTime())) return null;
      const daysSince = Math.round((today - last) / (1000 * 60 * 60 * 24));
      if (daysSince < staleAfterDays) return null;
      const weeksSince = Math.round(daysSince / 7);
      return {
        ...customer,
        daysSince,
        insight: tr('ai.retention', { name: customer.name, count: weeksSince }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.daysSince - a.daysSince);

  return atRisk;
}

/** Period-over-period sales growth, plus a plain-language recommendation. */
export function recommendBusinessGrowth(transactions, { windowDays = 30, today = new Date() } = {}) {
  const cutoff1 = new Date(today);
  cutoff1.setDate(cutoff1.getDate() - windowDays);
  const cutoff2 = new Date(today);
  cutoff2.setDate(cutoff2.getDate() - windowDays * 2);

  const inRange = (dateStr, from, to) => {
    const d = toDate(dateStr);
    return !Number.isNaN(d.getTime()) && d >= from && d < to;
  };

  const currentSales = (transactions || [])
    .filter((t) => t.type === 'sale' && inRange(t.date, cutoff1, today))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const previousSales = (transactions || [])
    .filter((t) => t.type === 'sale' && inRange(t.date, cutoff2, cutoff1))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const growthPct = previousSales > 0 ? Math.round(((currentSales - previousSales) / previousSales) * 100) : null;

  let insight;
  if (previousSales === 0 && currentSales === 0) {
    insight = tr('ai.growthNone');
  } else if (growthPct === null) {
    insight = tr('ai.growthFirst', { amount: money(currentSales), days: windowDays });
  } else if (growthPct > 0) {
    insight = tr('ai.growthUp', { pct: growthPct, days: windowDays, now: money(currentSales), before: money(previousSales) });
  } else if (growthPct < 0) {
    insight = tr('ai.growthDown', { pct: Math.abs(growthPct), days: windowDays, now: money(currentSales), before: money(previousSales) });
  } else {
    insight = tr('ai.growthFlat', { days: windowDays, amount: money(currentSales) });
  }

  return { currentPeriodSales: currentSales, previousPeriodSales: previousSales, growthPct, insight };
}
