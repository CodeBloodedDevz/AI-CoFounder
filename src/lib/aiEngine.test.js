import {
  summarise,
  topSellingProducts,
  lowStockProducts,
  stockStatus,
  restockRecommendation,
  recommendPrice,
  locationPriceFactor,
  parseDurationMinutes,
  estimateServiceOperatingCost,
  recommendServicePrice,
  serviceBookingCounts,
  recommendBusyHours,
  customerStats,
  recommendCustomerRetention,
  recommendBusinessGrowth,
} from './aiEngine';

const transactions = [
  { type: 'sale', product: 'Coke', quantity: 3, amount: 45 },
  { type: 'sale', product: 'Bread', quantity: 5, amount: 92.5 },
  { type: 'expense', product: 'Rent', quantity: 1, amount: 50 },
];

const products = [
  { id: 'p1', name: 'Coke', stock: 4, lowStockThreshold: 10, price: 15, cost: 12 },
  { id: 'p2', name: 'Bread', stock: 24, lowStockThreshold: 10, price: 18.5, cost: 14 },
];

describe('summarise', () => {
  it('computes totals and profit correctly', () => {
    const { totalSales, totalExpenses, profit } = summarise(transactions);
    expect(totalSales).toBe(137.5);
    expect(totalExpenses).toBe(50);
    expect(profit).toBe(87.5);
  });
});

describe('topSellingProducts', () => {
  it('ranks products by sales value, highest first', () => {
    const top = topSellingProducts(transactions);
    expect(top[0].name).toBe('Bread');
    expect(top[1].name).toBe('Coke');
  });
});

describe('lowStockProducts / stockStatus', () => {
  it('flags products at or below their threshold as low stock', () => {
    const low = lowStockProducts(products);
    expect(low).toHaveLength(1);
    expect(low[0].name).toBe('Coke');
  });

  it('reports GOOD status for well-stocked products', () => {
    expect(stockStatus(products[1])).toBe('GOOD');
  });

  it('reports LOW status for products at/below threshold', () => {
    expect(stockStatus(products[0])).toBe('LOW');
  });

  it('reports OUT status for zero stock', () => {
    expect(stockStatus({ stock: 0, lowStockThreshold: 5 })).toBe('OUT');
  });
});

describe('restockRecommendation', () => {
  it('names low-stock products when present', () => {
    const rec = restockRecommendation(products);
    expect(rec).toMatch(/Coke/);
  });

  it('reports all clear when nothing is low', () => {
    const rec = restockRecommendation([{ name: 'X', stock: 50, lowStockThreshold: 5 }]);
    expect(rec).toMatch(/no restock needed/i);
  });
});

describe('recommendPrice', () => {
  it('recommends a higher price when demand is strong', () => {
    const highDemandTxns = [{ type: 'sale', product: 'Coke', quantity: 10, amount: 150 }];
    const rec = recommendPrice(products[0], highDemandTxns, { location: '' });
    expect(rec.recommendedPrice).toBeGreaterThan(rec.currentPrice);
  });

  it('holds price steady when demand is low and location is neutral', () => {
    const rec = recommendPrice(products[0], [], { location: '' });
    expect(rec.recommendedPrice).toBe(rec.currentPrice);
  });

  it('recommends a higher price for a Cape Town business than an identical rural one', () => {
    const capeTown = recommendPrice(products[0], [], { location: '12 Long Street, Cape Town' });
    const rural = recommendPrice(products[0], [], { location: 'Rural village, Limpopo' });
    expect(capeTown.recommendedPrice).toBeGreaterThan(rural.recommendedPrice);
  });
});

describe('locationPriceFactor', () => {
  it('boosts prices for Johannesburg', () => {
    expect(locationPriceFactor('Sandton, Johannesburg').factor).toBeGreaterThan(1);
  });

  it('boosts prices even more for Cape Town', () => {
    const jhb = locationPriceFactor('Johannesburg');
    const cpt = locationPriceFactor('Cape Town');
    expect(cpt.factor).toBeGreaterThan(jhb.factor);
  });

  it('defaults to a neutral factor for an unknown location', () => {
    expect(locationPriceFactor('Some Small Town').factor).toBe(1.0);
  });
});

/* ---------- Service-based AI helpers ---------- */

describe('parseDurationMinutes', () => {
  it('parses "45 minutes"', () => {
    expect(parseDurationMinutes('45 minutes')).toBe(45);
  });
  it('parses "1 hour"', () => {
    expect(parseDurationMinutes('1 hour')).toBe(60);
  });
  it('parses "1.5 hours"', () => {
    expect(parseDurationMinutes('1.5 hours')).toBe(90);
  });
  it('defaults sensibly for unparseable input', () => {
    expect(parseDurationMinutes('')).toBe(60);
  });
});

describe('estimateServiceOperatingCost', () => {
  it('scales with duration', () => {
    const short = estimateServiceOperatingCost('30 minutes');
    const long = estimateServiceOperatingCost('90 minutes');
    expect(long).toBeGreaterThan(short);
  });
});

describe('recommendServicePrice', () => {
  const haircut = { name: 'Haircut', price: 150, duration: '45 minutes', category: 'Grooming' };

  it('recommends a higher price when a service is booked heavily', () => {
    const heavyBookings = Array.from({ length: 10 }, (_, i) => ({
      id: `w${i}`,
      service: 'Haircut',
      status: 'Completed',
    }));
    const rec = recommendServicePrice(haircut, heavyBookings, { location: '' });
    expect(rec.recommendedPrice).toBeGreaterThan(rec.currentPrice);
  });

  it('includes an estimated operating cost based on duration', () => {
    const rec = recommendServicePrice(haircut, [], { location: '' });
    expect(rec.estimatedOperatingCost).toBeGreaterThan(0);
  });

  it('gives a location-aware reason for a Cape Town business', () => {
    const rec = recommendServicePrice(haircut, [], { location: 'Cape Town' });
    expect(rec.locationArea).toBe('Cape Town');
  });
});

describe('serviceBookingCounts', () => {
  it('counts and ranks bookings per service', () => {
    const work = [
      { service: 'Haircut' },
      { service: 'Haircut' },
      { service: 'Fade' },
    ];
    const counts = serviceBookingCounts(work);
    expect(counts[0]).toEqual({ name: 'Haircut', count: 2 });
  });

  it('returns an empty array when there is no work', () => {
    expect(serviceBookingCounts([])).toEqual([]);
  });
});

describe('recommendBusyHours', () => {
  it('identifies the busiest day and hour', () => {
    const work = [
      { date: '2026-09-19', time: '10:00' }, // Saturday
      { date: '2026-09-19', time: '10:30' },
      { date: '2026-09-14', time: '14:00' }, // Monday
    ];
    const result = recommendBusyHours(work);
    expect(result.byDay[0].day).toBe('Saturday');
    expect(result.byHour[0].hour).toBe(10);
    expect(result.insight).toMatch(/Saturday/);
  });

  it('gives a gentle prompt when there is no data yet', () => {
    const result = recommendBusyHours([]);
    expect(result.insight).toMatch(/Schedule a few appointments/i);
  });
});

describe('customerStats', () => {
  const services = [{ name: 'Haircut', price: 150 }];
  it('sums spend and visits from completed work only', () => {
    const customer = { id: 'c1', name: 'Thando' };
    const work = [
      { customerId: 'c1', service: 'Haircut', status: 'Completed', date: '2026-08-01' },
      { customerId: 'c1', service: 'Haircut', status: 'Pending', date: '2026-09-01' },
    ];
    const stats = customerStats(customer, work, services);
    expect(stats.visits).toBe(1);
    expect(stats.totalSpent).toBe(150);
    expect(stats.lastVisitDate).toBe('2026-08-01');
  });
});

describe('recommendCustomerRetention', () => {
  const services = [{ name: 'Haircut', price: 150 }];
  it('flags a customer who has not visited in a while', () => {
    const customers = [{ id: 'c1', name: 'Thando' }];
    const work = [{ customerId: 'c1', service: 'Haircut', status: 'Completed', date: '2026-01-01' }];
    const result = recommendCustomerRetention(customers, work, services, { today: new Date('2026-03-01') });
    expect(result.length).toBe(1);
    expect(result[0].insight).toMatch(/Thando/);
  });

  it('does not flag a customer who visited recently', () => {
    const customers = [{ id: 'c1', name: 'Thando' }];
    const work = [{ customerId: 'c1', service: 'Haircut', status: 'Completed', date: '2026-02-25' }];
    const result = recommendCustomerRetention(customers, work, services, { today: new Date('2026-03-01') });
    expect(result.length).toBe(0);
  });
});

describe('recommendBusinessGrowth', () => {
  it('reports positive growth when recent sales beat the prior period', () => {
    const today = new Date('2026-03-01');
    const txns = [
      { type: 'sale', amount: 100, date: '2026-01-15' }, // previous 30-60 day window
      { type: 'sale', amount: 300, date: '2026-02-20' }, // last 30 days
    ];
    const result = recommendBusinessGrowth(txns, { today });
    expect(result.growthPct).toBeGreaterThan(0);
    expect(result.insight).toMatch(/up/i);
  });

  it('prompts for more data when nothing has been recorded', () => {
    const result = recommendBusinessGrowth([], { today: new Date('2026-03-01') });
    expect(result.insight).toMatch(/Record a few more sales/i);
  });
});
