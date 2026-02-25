const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const flutterwaveService = require('../services/flutterwaveService');
const { getPlanById } = require('../config/plans');

async function flutterwaveWebhook(req, res) {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const secretHash = await flutterwaveService.getWebhookSecretHash();
  if (secretHash && !flutterwaveService.verifyWebhookPayload(payload, secretHash)) {
    return res.status(401).json({ message: 'Webhook verification failed' });
  }

  const event = payload.event || payload.event_type;
  const data = payload.data || payload;

  if (event === 'charge.completed' || (data && data.status === 'successful')) {
    const status = data.status || data.flw_status;
    if (status !== 'successful' && status !== 'succeeded') {
      return res.json({ received: true });
    }
    const meta = data.meta || {};
    const userId = meta.userId;
    const planId = meta.planId || 'starter';
    const currency = (meta.currency || data.currency || 'USD').toUpperCase();
    if (!userId) {
      return res.json({ received: true });
    }
    const plan = getPlanById(planId);
    if (!plan || plan.id === 'free_trial') return res.json({ received: true });

    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const amount = Math.round(parseFloat(data.amount || 0) * 100) || (plan.prices && plan.prices[currency] ? plan.prices[currency].amount : 0);

    let sub = await Subscription.findOne({ userId });
    if (!sub) {
      sub = await Subscription.create({
        userId,
        plan: planId,
        status: 'active',
        currency,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        paymentMethod: 'flutterwave',
        flutterwaveSubscriptionId: data.id || null,
      });
    } else {
      sub.plan = planId;
      sub.status = 'active';
      sub.currency = currency;
      sub.currentPeriodStart = periodStart;
      sub.currentPeriodEnd = periodEnd;
      sub.paymentMethod = 'flutterwave';
      await sub.save();
    }

    await Payment.create({
      userId,
      subscriptionId: sub._id,
      amount,
      currency,
      status: 'succeeded',
      paymentMethod: 'flutterwave',
      externalId: data.id || data.tx_ref,
      paidAt: new Date(),
      metadata: { tx_ref: data.tx_ref },
    });

    await User.findByIdAndUpdate(userId, {
      plan: planId,
      subscriptionStatus: 'active',
      trialEndsAt: null,
    });
  }

  res.json({ received: true });
}

module.exports = { flutterwaveWebhook };
