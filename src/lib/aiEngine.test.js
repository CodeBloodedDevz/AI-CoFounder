import {
  summarise,
  topSellingProducts,
  lowStockProducts,
  stockStatus,
  restockRecommendation,
  recommendPrice,
  locationPriceFactor,
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
