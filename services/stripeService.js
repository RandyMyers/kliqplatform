const Stripe = require('stripe');
const PaymentGatewayConfig = require('../models/PaymentGatewayConfig');
const { decryptPaymentCreds } = require('./paymentEncryption');
const { getPlanById, getPriceForPlan, CURRENCIES } = require('../config/plans');

let _stripe = null;
let _webhookSecret = null;

async function getStripe() {
  if (_stripe) return _stripe;
  const fromEnv = process.env.STRIPE_SECRET_KEY;
  if (fromEnv) {
    _stripe = new Stripe(fromEnv);
    _webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || null;
    return _stripe;
  }
  const config = await PaymentGatewayConfig.findOne({ gateway: 'stripe' });
  if (!config || !config.encryptedCredentials) return null;
  const raw = decryptPaymentCreds(config.encryptedCredentials);
  if (!raw) return null;
  const creds = JSON.parse(raw);
  if (!creds.secretKey) return null;
  _stripe = new Stripe(creds.secretKey);
  _webhookSecret = creds.webhookSecret || null;
  return _stripe;
}

async function getWebhookSecret() {
  if (_webhookSecret) return _webhookSecret;
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  const config = await PaymentGatewayConfig.findOne({ gateway: 'stripe' });
  if (!config || !config.encryptedCredentials) return null;
  const raw = decryptPaymentCreds(config.encryptedCredentials);
  if (!raw) return null;
  const creds = JSON.parse(raw);
  return creds.webhookSecret || null;
}

/**
 * Create a Stripe Payment Link (see stripe.txt – Payment Links API).
 * User navigates to the returned URL to pay. We manage plans/subscriptions ourselves;
 * this is a one-time payment for the chosen plan/currency. On success we get checkout.session.completed.
 */
async function createPaymentLink({ userId, planId, currency, successUrl }) {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe is not configured');
  if (!CURRENCIES.includes(currency)) throw new Error('Invalid currency');
  const plan = getPlanById(planId);
  const price = getPriceForPlan(planId, currency);
  if (!plan || !price || plan.id === 'free_trial') throw new Error('Invalid plan or currency');
  const paymentLink = await stripe.paymentLinks.create({
    line_items: [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: plan.name,
            description: plan.description || undefined,
          },
          unit_amount: price.amount,
        },
        quantity: 1,
      },
    ],
    metadata: { userId: String(userId), planId, currency },
    after_completion: {
      type: 'redirect',
      redirect: { url: successUrl },
    },
  });
  return { url: paymentLink.url, paymentLinkId: paymentLink.id };
}

/** Alias for backward compatibility; creates a payment link (not a Checkout Session). */
async function createCheckoutSession({ userId, userEmail, planId, currency, successUrl, cancelUrl }) {
  return createPaymentLink({ userId, planId, currency, successUrl: successUrl || cancelUrl });
}

async function createPortalSession({ customerId, returnUrl }) {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe is not configured');
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

async function constructWebhookEvent(payload, signature) {
  const secret = await getWebhookSecret();
  if (!secret) throw new Error('Stripe webhook secret not configured');
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}

module.exports = {
  getStripe,
  getWebhookSecret,
  createPaymentLink,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
};
