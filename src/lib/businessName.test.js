import { getBusinessName, hasBusinessName } from './businessName';

test('returns the trimmed saved name', () => {
  expect(getBusinessName({ name: "  Thando's   Spaza " })).toBe("Thando's Spaza");
  expect(hasBusinessName({ name: 'Salon K' })).toBe(true);
});

test('returns empty for missing, blank or non-string names', () => {
  expect(getBusinessName(null)).toBe('');
  expect(getBusinessName({ name: null })).toBe('');
  expect(getBusinessName({ name: '   ' })).toBe('');
  expect(hasBusinessName({ name: '' })).toBe(false);
});
