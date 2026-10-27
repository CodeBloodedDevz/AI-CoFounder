// The business name comes from the saved business profile (GET /business -> state.business.name).
// A profile can exist without a usable name (older setups allowed leaving it blank), so every
// screen asks this helper instead of repeating its own fallback.
export const BUSINESS_NAME_FALLBACK = 'Welcome';

export function getBusinessName(business) {
  const name = typeof business?.name === 'string' ? business.name.replace(/\s+/g, ' ').trim() : '';
  return name;
}

export function hasBusinessName(business) {
  return getBusinessName(business).length > 0;
}
