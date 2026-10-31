import { parseAmount, positiveAmount, nonNegativeAmount, isEmail, compactMoney } from './numbers';

describe('parseAmount', () => {
  test('reads the ways people type amounts', () => {
    expect(parseAmount('50')).toBe(50);
    expect(parseAmount('50,5')).toBe(50.5);
    expect(parseAmount('R 1 250,50')).toBe(1250.5);
    expect(parseAmount('1,250.00')).toBe(1250);
    expect(parseAmount('1,250')).toBe(1250);
    expect(parseAmount('€12.40')).toBe(12.4);
    expect(parseAmount(7)).toBe(7);
  });
  test('refuses what is not a number', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount(NaN)).toBeNull();
  });
  test('positive / non-negative helpers', () => {
    expect(positiveAmount('0')).toBeNull();
    expect(positiveAmount('3')).toBe(3);
    expect(nonNegativeAmount('0')).toBe(0);
    expect(nonNegativeAmount('-2')).toBeNull();
  });
  test('isEmail', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail(' thando@shop.co.za ')).toBe(true);
    expect(isEmail('nope')).toBe(false);
  });
  test('compactMoney: short amounts for a graph scale', () => {
    expect([0, 950, 999.6, 1250, 12500, -30, 1500000].map((v) => compactMoney(v, 'R'))).toEqual(['R0', 'R950', 'R1k', 'R1.3k', 'R13k', '-R30', 'R1.5M']);
    expect(compactMoney(2000, '€')).toBe('€2k');
  });
});
