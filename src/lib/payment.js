// Plans as shown in the app. Payments run through Paystack's own checkout page, so this app never
// sees or handles card details. The SERVER holds the real prices (backend/src/lib/plans.js) and
// ignores any amount the app sends; plansParity.test.js keeps these two lists identical.

export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceAnnual: 0,
    tagline: 'Get started with the basics',
    features: ['1 business profile', 'Manual sales & expense tracking', 'Basic AI insight of the week', 'Up to 20 AI messages a day'],
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
      'Advertise on the Sponsored page',
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
      '1 Sponsored advert a month included',
    ],
  },
];

export function getPlan(planId) {
  return PLANS.find((p) => p.id === planId) || PLANS[0];
}

export function planPrice(plan, billingCycle) {
  return billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly;
}

export const planRank = (planId) => Math.max(0, PLANS.findIndex((p) => p.id === planId));

export const formatRand = (amount) => `R${Number(amount || 0).toFixed(Number.isInteger(Number(amount)) ? 0 : 2)}`;

// Wording for each payment outcome the server can report.
export const PAYMENT_STATUS_LABEL = {
  pending: 'Pending',
  success: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  mismatch: 'Needs review',
  refunded: 'Refunded',
};
