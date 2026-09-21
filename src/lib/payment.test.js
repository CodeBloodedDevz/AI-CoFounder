import {
  isValidCardNumber,
  detectCardBrand,
  formatCardNumber,
  formatExpiry,
  isValidExpiry,
  isValidCvv,
  last4,
  planPrice,
  getPlan,
  addBillingPeriod,
} from './payment';

describe('card number validation', () => {
  test('accepts a valid Visa test number', () => {
    expect(isValidCardNumber('4242 4242 4242 4242')).toBe(true);
  });

  test('rejects a number that fails the Luhn check', () => {
    expect(isValidCardNumber('4242 4242 4242 4241')).toBe(false);
  });

  test('rejects a too-short number', () => {
    expect(isValidCardNumber('4242')).toBe(false);
  });
});

describe('detectCardBrand', () => {
  test('detects Visa', () => {
    expect(detectCardBrand('4242424242424242')).toBe('Visa');
  });
  test('detects Mastercard', () => {
    expect(detectCardBrand('5555555555554444')).toBe('Mastercard');
  });
  test('detects Amex', () => {
    expect(detectCardBrand('378282246310005')).toBe('Amex');
  });
});

describe('formatCardNumber', () => {
  test('groups digits in fours for non-Amex cards', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
  });
  test('groups digits 4-6-5 for Amex cards', () => {
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
  });
});

describe('formatExpiry / isValidExpiry', () => {
  test('formats MMYY into MM/YY', () => {
    expect(formatExpiry('1228')).toBe('12/28');
  });
  test('rejects an invalid month', () => {
    expect(isValidExpiry('13/28')).toBe(false);
  });
  test('rejects a past year', () => {
    expect(isValidExpiry('01/20')).toBe(false);
  });
  test('accepts a future date', () => {
    expect(isValidExpiry('12/35')).toBe(true);
  });
});

describe('isValidCvv', () => {
  test('requires 3 digits for non-Amex', () => {
    expect(isValidCvv('123', 'Visa')).toBe(true);
    expect(isValidCvv('12', 'Visa')).toBe(false);
  });
  test('requires 4 digits for Amex', () => {
    expect(isValidCvv('1234', 'Amex')).toBe(true);
    expect(isValidCvv('123', 'Amex')).toBe(false);
  });
});

test('last4 returns the final 4 digits only', () => {
  expect(last4('4242 4242 4242 4242')).toBe('4242');
});

test('planPrice reflects billing cycle', () => {
  const pro = getPlan('pro');
  expect(planPrice(pro, 'monthly')).toBe(pro.priceMonthly);
  expect(planPrice(pro, 'annual')).toBe(pro.priceAnnual);
});

test('addBillingPeriod adds a month or a year', () => {
  expect(addBillingPeriod('2026-01-15', 'monthly')).toBe('2026-02-15');
  expect(addBillingPeriod('2026-01-15', 'annual')).toBe('2027-01-15');
});
