// Lightweight card-payment helpers used by the Subscription screen.
// This app has no backend or real payment gateway, so these functions
// validate and format input locally. Only a masked summary (brand,
// last 4 digits, expiry) is ever persisted — never the full card
// number or CVV.

export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceAnnual: 0,
    tagline: 'Get started with the basics',
    features: ['1 business profile', 'Manual sales & expense tracking', 'Basic AI insight of the week'],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 99,
    priceAnnual: 950,
    tagline: 'For growing businesses that want smarter decisions',
    features: [
      'Everything in Free',
      'Unlimited AI Co-Founder chat',
      'Pricing & restock recommendations',
      'Full business analytics history',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    priceMonthly: 249,
    priceAnnual: 2390,
    tagline: 'For businesses ready to scale',
    features: [
      'Everything in Pro',
      'Multi-business support',
      'Customer retention & growth insights',
      'Priority support',
    ],
  },
];

export function getPlan(planId) {
  return PLANS.find((p) => p.id === planId) || PLANS[0];
}

export function planPrice(plan, billingCycle) {
  return billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly;
}

// Luhn checksum — catches typos, not fraud.
export function isValidCardNumber(number) {
  const digits = (number || '').replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = parseInt(digits[i], 10);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function detectCardBrand(number) {
  const digits = (number || '').replace(/\D/g, '');
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^6(?:011|5)/.test(digits)) return 'Discover';
  return 'Card';
}

export function formatCardNumber(number) {
  const digits = (number || '').replace(/\D/g, '').slice(0, 19);
  const isAmex = /^3[47]/.test(digits);
  if (isAmex) {
    return digits.replace(/^(\d{0,4})(\d{0,6})(\d{0,5})$/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '));
  }
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function formatExpiry(input) {
  const digits = (input || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function isValidExpiry(expiry) {
  const match = /^(\d{2})\/(\d{2})$/.exec(expiry || '');
  if (!match) return false;
  const month = parseInt(match[1], 10);
  const year = 2000 + parseInt(match[2], 10);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  return true;
}

export function isValidCvv(cvv, brand) {
  const digits = (cvv || '').replace(/\D/g, '');
  return brand === 'Amex' ? digits.length === 4 : digits.length === 3;
}

export function last4(number) {
  const digits = (number || '').replace(/\D/g, '');
  return digits.slice(-4);
}

export function addBillingPeriod(fromDate, billingCycle) {
  const date = new Date(fromDate);
  if (billingCycle === 'annual') {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().slice(0, 10);
}
