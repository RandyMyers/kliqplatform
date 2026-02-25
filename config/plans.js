/**
 * Subscription plans with multi-currency pricing (amounts in minor units: cents).
 * stripePriceId / flutterwavePlanId filled when gateways are configured.
 */
const PLANS = [
  {
    id: 'free_trial',
    name: 'Free Trial',
    slug: 'free_trial',
    description: 'Full access for 14 days',
    limits: { stores: 1 },
    features: ['Full access for 14 days'],
    prices: null,
    interval: null,
    stripePriceId: {},
    flutterwavePlanId: null,
  },
  {
    id: 'starter',
    name: 'Starter',
    slug: 'starter',
    description: 'Up to 2 stores, basic analytics',
    limits: { stores: 2 },
    features: ['Up to 2 stores', 'Basic analytics'],
    prices: {
      USD: { amount: 2900, currency: 'USD' },
      EUR: { amount: 2700, currency: 'EUR' },
      GBP: { amount: 2500, currency: 'GBP' },
    },
    interval: 'month',
    stripePriceId: {},
    flutterwavePlanId: null,
  },
  {
    id: 'pro',
    name: 'Pro',
    slug: 'pro',
    description: 'Up to 10 stores, advanced analytics, priority support',
    limits: { stores: 10 },
    features: ['Up to 10 stores', 'Advanced analytics', 'Priority support'],
    prices: {
      USD: { amount: 7900, currency: 'USD' },
      EUR: { amount: 7300, currency: 'EUR' },
      GBP: { amount: 6500, currency: 'GBP' },
    },
    interval: 'month',
    stripePriceId: {},
    flutterwavePlanId: null,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    slug: 'enterprise',
    description: 'Unlimited stores, custom integrations, dedicated support',
    limits: { stores: -1 },
    features: ['Unlimited stores', 'Custom integrations', 'Dedicated support'],
    prices: {
      USD: { amount: 19900, currency: 'USD' },
      EUR: { amount: 18500, currency: 'EUR' },
      GBP: { amount: 16500, currency: 'GBP' },
    },
    interval: 'month',
    stripePriceId: {},
    flutterwavePlanId: null,
  },
];

const PAID_PLAN_IDS = ['starter', 'pro', 'enterprise'];
const CURRENCIES = ['USD', 'EUR', 'GBP'];

function getPlanById(id) {
  return PLANS.find((p) => p.id === id) || PLANS[0];
}

function getPaidPlans() {
  return PLANS.filter((p) => PAID_PLAN_IDS.includes(p.id));
}

function getPriceForPlan(planId, currency) {
  const plan = getPlanById(planId);
  if (!plan || !plan.prices || !CURRENCIES.includes(currency)) return null;
  return plan.prices[currency] || null;
}

module.exports = {
  PLANS,
  PAID_PLAN_IDS,
  CURRENCIES,
  getPlanById,
  getPaidPlans,
  getPriceForPlan,
};
