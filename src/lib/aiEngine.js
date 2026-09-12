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
export function chatReply(intent, { transactions, products }) {
  const { totalSales, totalExpenses, profit } = summarise(transactions);
  const low = lowStockProducts(products);

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
      return "Open AI Pricing Assistant and pick a product — I'll show you a recommended price based on cost, demand, recent sales and your business location.";
    default:
      return "I can help with sales analysis, profit, restocking and pricing — ask me anything about your business.";
  }
}
