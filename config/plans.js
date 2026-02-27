/**
 * Subscription plans with multi-currency and multi-interval pricing (amounts in minor units: cents).
 * Prices: month, quarter (3mo), half_year (6mo), year (12mo).
 */
const INTERVALS = ['month', 'quarter', 'half_year', 'year'];

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
      USD: { amount: 2900, month: 2900, quarter: 7500, half_year: 14000, year: 25000, currency: 'USD' },
      EUR: { amount: 2700, month: 2700, quarter: 7000, half_year: 13000, year: 23000, currency: 'EUR' },
      GBP: { amount: 2500, month: 2500, quarter: 6500, half_year: 12000, year: 21000, currency: 'GBP' },
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
      USD: { amount: 7900, month: 7900, quarter: 20500, half_year: 38000, year: 68000, currency: 'USD' },
      EUR: { amount: 7300, month: 7300, quarter: 19000, half_year: 35000, year: 63000, currency: 'EUR' },
      GBP: { amount: 6500, month: 6500, quarter: 16900, half_year: 31200, year: 56000, currency: 'GBP' },
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
      USD: { amount: 19900, month: 19900, quarter: 52000, half_year: 96000, year: 172000, currency: 'USD' },
      EUR: { amount: 18500, month: 18500, quarter: 48200, half_year: 89000, year: 160000, currency: 'EUR' },
      GBP: { amount: 16500, month: 16500, quarter: 43000, half_year: 79200, year: 142000, currency: 'GBP' },
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

/** Get price for plan/currency/interval. interval defaults to 'month'. */
function getPriceForPlan(planId, currency, interval = 'month') {
  const plan = getPlanById(planId);
  if (!plan || !plan.prices || !CURRENCIES.includes(currency)) return null;
  const pc = plan.prices[currency];
  if (!pc) return null;
  const amt = pc[interval] ?? pc.month ?? pc.amount;
  if (amt == null) return null;
  return { amount: amt, currency: pc.currency || currency };
}

module.exports = {
  PLANS,
  PAID_PLAN_IDS,
  CURRENCIES,
  INTERVALS,
  getPlanById,
  getPaidPlans,
  getPriceForPlan,
};
