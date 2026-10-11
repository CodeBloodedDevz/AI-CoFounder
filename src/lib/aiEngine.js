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

/** Generates the "AI Co-Founder Insight" text shown on the dashboard. */
export function dashboardInsight({ totalSales, totalExpenses, profit }, lowStock) {
  const marginPct = totalSales > 0 ? Math.round((profit / totalSales) * 100) : 0;
  const stockNote = lowStock.length
    ? ` Keep an eye on ${lowStock.map((p) => p.name).join(', ')} — running low.`
    : ' Stock levels look healthy across your products.';

  if (profit <= 0) {
    return `Your expenses (R${totalExpenses.toFixed(0)}) are outpacing sales this period. Consider reviewing your biggest cost drivers before restocking.${stockNote}`;
  }

  return `You're running at a ${marginPct}% margin this period, with R${profit.toFixed(0)} profit so far.${stockNote}`;
}


export function analyticsInsight(transactions) {
  const { totalSales, totalExpenses } = summarise(transactions);
  const top = topSellingProducts(transactions, 1)[0];

  if (!top) return 'Record a few sales to unlock personalised insights.';

  const salesGrowth = totalSales > totalExpenses ? 'trending upward' : 'under pressure from expenses';

  return `Your highest-earning product is ${top.name}. Overall sales are ${salesGrowth}. Consider promoting ${top.name} or bundling it with slower-moving stock to lift average basket size.`;
}

/** Generates a one-line restock recommendation summary for the dashboard/insight card. */
export function restockRecommendation(products) {
  const low = lowStockProducts(products);
  const out = outOfStockProducts(products);

  if (!low.length && !out.length) {
    return 'All products are well stocked — no restock needed right now.';
  }

  const urgent = [...out, ...low].slice(0, 3).map((p) => p.name);
  return `Restock ${urgent.join(', ')} soon — based on recent sales velocity, ${urgent[0]} is likely to sell out first.`;
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
    return { factor: 1.08, area: 'Cape Town' };
  }
  if (
    loc.includes('sandton') ||
    loc.includes('johannesburg') ||
    loc.includes('joburg') ||
    loc.includes('jozi') ||
    loc.includes('jhb')
  ) {
    return { factor: 1.05, area: 'Johannesburg' };
  }
  if (loc.includes('pretoria') || loc.includes('tshwane')) {
    return { factor: 1.03, area: 'Pretoria' };
  }
  if (loc.includes('durban') || loc.includes('umhlanga') || loc.includes('ethekwini')) {
    return { factor: 1.02, area: 'Durban' };
  }
  if (loc.includes('soweto') || loc.includes('township') || loc.includes('rural')) {
    return { factor: 0.94, area: 'a township/rural area' };
  }

  return { factor: 1.0, area: null };
}

/** AI pricing recommendation for a single product, now location-aware. */
export function recommendPrice(product, transactions, business) {
  const sold = transactions.filter((t) => t.type === 'sale' && t.product === product.name);
  const unitsSold = sold.reduce((sum, t) => sum + Number(t.quantity || 0), 0);

  const margin = product.price > 0 ? (product.price - product.cost) / product.price : 0;
  const demandFactor = unitsSold >= 8 ? 1.12 : unitsSold >= 3 ? 1.06 : 1.0;

  const { factor: locationFactor, area } = locationPriceFactor(business?.location);

  const recommended = Math.round(product.price * demandFactor * locationFactor * 100) / 100;
  const marginPct = Math.round(margin * 100);

  let reason;
  if (demandFactor > 1) {
    reason = `Based on your costs, recent sales and demand for ${product.name}, you could raise the price slightly without significantly affecting demand.`;
  } else {
    reason = `${product.name} is currently priced close to optimal for its demand level — hold steady and monitor for a few more sales before adjusting.`;
  }

  if (area && locationFactor > 1) {
    reason += ` Prices in ${area} also tend to run a bit higher than other regions, so that's factored in too.`;
  } else if (area && locationFactor < 1) {
    reason += ` Shops in ${area} typically price a bit lower to stay affordable for the local market, so that's factored in too.`;
  }

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
      return `Hi! I've analysed your business this week. Sales: R${totalSales.toFixed(0)}, Expenses: R${totalExpenses.toFixed(0)}, Profit: R${profit.toFixed(0)}.`;
    case 'profit':
      return profit > 0
        ? `You're profitable — R${profit.toFixed(0)} so far. To grow it further, focus on your top sellers and consider trimming your biggest expense line.`
        : `Your expenses currently exceed sales by R${Math.abs(profit).toFixed(0)}. I'd recommend reviewing recurring costs first.`;
    case 'restock':
      return low.length
        ? `You should restock: ${low.map((p) => p.name).join(', ')}.`
        : 'Nothing urgent — your stock levels are all above their low-stock threshold.';
    case 'prices':
      return "Open AI Pricing Assistant and pick a product or service — I'll show you a recommended price based on cost, demand, recent bookings and your business location.";
    case 'busyHours':
      return recommendBusyHours(upcomingWork).insight;
    case 'retention': {
      const atRisk = recommendCustomerRetention(customers, upcomingWork, services);
      if (!atRisk.length) return "All your customers have booked recently — no one needs a reminder right now.";
      return atRisk.slice(0, 3).map((c) => c.insight).join(' ');
    }
    case 'growth':
      return recommendBusinessGrowth(transactions).insight;
    case 'popularService': {
      const popular = serviceBookingCounts(upcomingWork)[0];
      return popular
        ? `${popular.name} is your most-booked service with ${popular.count} booking${popular.count === 1 ? '' : 's'}. Consider promoting it further or bundling it with a slower-moving service.`
        : 'Schedule a few bookings to see which service is most popular.';
    }
    default:
      return "I can help with sales analysis, profit, restocking, pricing, busy hours, and customer follow-ups — ask me anything about your business.";
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
  const { factor: locationFactor, area } = locationPriceFactor(business?.location);

  const operatingCost = estimateServiceOperatingCost(service.duration);
  const durationMins = parseDurationMinutes(service.duration);
  const marginPct = service.price > 0 ? Math.round(((service.price - operatingCost) / service.price) * 100) : 0;
  const recommended = Math.round(service.price * demandFactor * locationFactor);

  let reason;
  if (demandFactor > 1) {
    reason = `${service.name} is being booked regularly. At ${durationMins} minutes and an estimated running cost of R${operatingCost}, your current price is likely leaving money on the table — consider raising it slightly.`;
  } else if (marginPct < 30) {
    reason = `${service.name} takes about ${durationMins} minutes with an estimated running cost of R${operatingCost}, which leaves a thin margin at your current price. A small increase would protect your profit.`;
  } else {
    reason = `${service.name} is priced reasonably for its duration and current booking volume — hold steady and revisit once you have more bookings.`;
  }

  if (area && locationFactor > 1) reason += ` Businesses in ${area} also tend to charge a bit more for similar services.`;
  else if (area && locationFactor < 1) reason += ` Businesses in ${area} typically price a little lower to stay affordable locally.`;

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

/** How many times each service has been booked (any status) — powers "Most popular service". */
export function serviceBookingCounts(upcomingWork) {
  const counts = {};
  (upcomingWork || []).forEach((w) => {
    if (!w.service) return;
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
    return { byHour, byDay, insight: 'Schedule a few appointments to see which days and times are busiest.' };
  }

  const topDay = byDay[0];
  const topHour = byHour[0];
  const parts = [];
  if (topDay) parts.push(`${topDay.day}s are your busiest day${topDay.count > 1 ? 's' : ''}`);
  if (topHour) parts.push(`${String(topHour.hour).padStart(2, '0')}:00 is your busiest time`);

  const insight = parts.length
    ? `${parts.join(', and ')}. Consider adjusting pricing or staffing around ${topDay ? topDay.day : 'that time'}.`
    : 'Schedule a few appointments to see which days and times are busiest.';

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
  const atRisk = (customers || [])
    .map((customer) => {
      const stats = customerStats(customer, upcomingWork, services);
      if (!stats.lastVisitDate) return null;
      const last = new Date(stats.lastVisitDate);
      if (Number.isNaN(last.getTime())) return null;
      const daysSince = Math.round((today - last) / (1000 * 60 * 60 * 24));
      if (daysSince < staleAfterDays) return null;
      const weeksSince = Math.round(daysSince / 7);
      return {
        ...customer,
        daysSince,
        insight: `${customer.name} hasn't booked an appointment in ${weeksSince} week${weeksSince === 1 ? '' : 's'}. Consider sending a reminder.`,
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
    const d = new Date(dateStr);
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
    insight = 'Record a few more sales to start seeing growth trends over time.';
  } else if (growthPct === null) {
    insight = `You've brought in R${currentSales.toFixed(0)} in the last ${windowDays} days — keep recording sales to track growth against future periods.`;
  } else if (growthPct > 0) {
    insight = `Sales are up ${growthPct}% over the previous ${windowDays} days (R${currentSales.toFixed(0)} vs R${previousSales.toFixed(0)}). Keep doing what's working, and consider reinvesting some profit into your best-performing product or service.`;
  } else if (growthPct < 0) {
    insight = `Sales are down ${Math.abs(growthPct)}% over the previous ${windowDays} days (R${currentSales.toFixed(0)} vs R${previousSales.toFixed(0)}). Consider a promotion on your top seller or reviewing recent pricing changes.`;
  } else {
    insight = `Sales are flat compared with the previous ${windowDays} days at R${currentSales.toFixed(0)}. Try promoting a slower-moving product or service to spark growth.`;
  }

  return { currentPeriodSales: currentSales, previousPeriodSales: previousSales, growthPct, insight };
}
