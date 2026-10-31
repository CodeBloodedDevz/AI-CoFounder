import { PLANS, getPlan, planPrice, planRank, formatRand, PAYMENT_STATUS_LABEL } from './payment';

describe('plans', () => {
  test('free, pro, premium in that order', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['free', 'pro', 'premium']);
    expect(planRank('free')).toBeLessThan(planRank('pro'));
    expect(planRank('pro')).toBeLessThan(planRank('premium'));
  });
  test('planPrice picks the billing cycle', () => {
    expect(planPrice(getPlan('pro'), 'monthly')).toBe(99);
    expect(planPrice(getPlan('pro'), 'annual')).toBe(950);
    expect(planPrice(getPlan('free'), 'annual')).toBe(0);
  });
  test('unknown plan falls back to Free', () => {
    expect(getPlan('gold').id).toBe('free');
  });
  test('formatRand', () => {
    expect(formatRand(99)).toBe('R99');
    expect(formatRand(99.5)).toBe('R99.50');
  });
  test('every payment status has a label', () => {
    for (const s of ['pending', 'success', 'failed', 'cancelled', 'expired', 'mismatch', 'refunded']) expect(PAYMENT_STATUS_LABEL[s]).toBeTruthy();
  });
});
