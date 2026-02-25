const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const stripeService = require('../services/stripeService');
const { getPlanById } = require('../config/plans');

async function handleCheckoutSessionCompleted(session) {
  const userId = session.client_reference_id || session.metadata?.userId || session.subscription?.metadata?.userId;
  if (!userId) return;
  const subscriptionId = session.subscription;
  const customerId = session.customer;
  const planId = session.metadata?.planId || 'starter';
  const currency = (session.metadata?.currency || 'USD').toUpperCase();
  const plan = getPlanById(planId);
  if (!plan || plan.id === 'free_trial') return;

  const stripe = await stripeService.getStripe();
  let periodStart, periodEnd, stripePriceId;
  if (subscriptionId && stripe) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      periodStart = new Date(sub.current_period_start * 1000);
      periodEnd = new Date(sub.current_period_end * 1000);
      stripePriceId = sub.items?.data?.[0]?.price?.id || null;
    } catch {
      periodStart = new Date();
      periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
  } else {
    periodStart = new Date();
    periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  let sub = await Subscription.findOne({ userId });
  if (!sub) {
    sub = await Subscription.create({
      userId,
      plan: planId,
      status: 'active',
      currency,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId,
      paymentMethod: 'stripe',
    });
  } else {
    sub.plan = planId;
    sub.status = 'active';
    sub.currency = currency;
    sub.currentPeriodStart = periodStart;
    sub.currentPeriodEnd = periodEnd;
    sub.stripeCustomerId = customerId || sub.stripeCustomerId;
    sub.stripeSubscriptionId = subscriptionId || sub.stripeSubscriptionId;
    sub.stripePriceId = stripePriceId || sub.stripePriceId;
    sub.paymentMethod = 'stripe';
    await sub.save();
  }

  const amount = session.amount_total || (plan.prices && plan.prices[currency] ? plan.prices[currency].amount : 0);
  await Payment.create({
    userId,
    subscriptionId: sub._id,
    amount,
    currency,
    status: 'succeeded',
    paymentMethod: 'stripe',
    externalId: session.payment_intent || session.id,
    paidAt: new Date(),
    metadata: { sessionId: session.id },
  });

  await User.findByIdAndUpdate(userId, {
    plan: planId,
    subscriptionStatus: 'active',
    trialEndsAt: null,
  });
}

async function handleSubscriptionUpdated(stripeSubscription) {
  const subId = stripeSubscription.id;
  const sub = await Subscription.findOne({ stripeSubscriptionId: subId });
  if (!sub) return;
  sub.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
  sub.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
  if (stripeSubscription.status === 'active') sub.status = 'active';
  else if (stripeSubscription.status === 'past_due') sub.status = 'past_due';
  else if (stripeSubscription.status === 'canceled' || stripeSubscription.status === 'unpaid') sub.status = 'cancelled';
  await sub.save();
  await User.findByIdAndUpdate(sub.userId, { subscriptionStatus: sub.status });
}

async function handleSubscriptionDeleted(stripeSubscription) {
  const sub = await Subscription.findOne({ stripeSubscriptionId: stripeSubscription.id });
  if (!sub) return;
  sub.status = 'cancelled';
  await sub.save();
  await User.findByIdAndUpdate(sub.userId, { subscriptionStatus: 'cancelled' });
}

async function handleInvoicePaid(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;
  const sub = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
  if (!sub) return;
  await Payment.create({
    userId: sub.userId,
    subscriptionId: sub._id,
    amount: invoice.amount_paid,
    currency: (invoice.currency || 'usd').toUpperCase(),
    status: 'succeeded',
    paymentMethod: 'stripe',
    externalId: invoice.payment_intent || invoice.id,
    paidAt: new Date(invoice.status_transitions.paid_at * 1000),
    metadata: { invoiceId: invoice.id },
  });
}

async function handleInvoicePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;
  const sub = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
  if (!sub) return;
  sub.status = 'past_due';
  await sub.save();
  await User.findByIdAndUpdate(sub.userId, { subscriptionStatus: 'past_due' });
}

async function stripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = req.body;
    if (!rawBody) {
      return res.status(400).send('No body');
    }
    event = await stripeService.constructWebhookEvent(rawBody, sig);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription') {
          await handleCheckoutSessionCompleted(session);
        }
        break;
      }
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { stripeWebhook };