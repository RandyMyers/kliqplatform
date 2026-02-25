const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const BankAccount = require('../models/BankAccount');
const Plan = require('../models/Plan');
const { getPlanById, PLANS, getPaidPlans, getPriceForPlan, CURRENCIES } = require('../config/plans');

async function resolvePlanConfig(planId) {
  const fromDb = await Plan.findOne({ $or: [{ slug: planId }, { _id: planId }], active: true }).lean();
  if (fromDb) {
    return {
      id: fromDb.slug,
      name: fromDb.name,
      slug: fromDb.slug,
      description: fromDb.description,
      limits: fromDb.limits || {},
      features: fromDb.features || [],
      prices: fromDb.prices || {},
      interval: fromDb.interval || 'month',
    };
  }
  return getPlanById(planId);
}

async function getPlan(req, res) {
  try {
    const user = await User.findById(req.user._id).select('plan trialEndsAt subscriptionStatus');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const subscription = await Subscription.findOne({ userId: user._id }).lean();
    const planConfig = await resolvePlanConfig(user.plan);
    const isTrialing = user.subscriptionStatus === 'trialing' && user.trialEndsAt && new Date(user.trialEndsAt) > new Date();
    const priceInfo = planConfig.prices ? { USD: planConfig.prices.USD, EUR: planConfig.prices.EUR, GBP: planConfig.prices.GBP } : null;
    res.json({
      plan: user.plan,
      planName: planConfig.name,
      features: planConfig.features,
      limits: planConfig.limits,
      prices: priceInfo,
      trialEndsAt: user.trialEndsAt || null,
      isTrialing,
      subscriptionStatus: user.subscriptionStatus,
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            paymentMethod: subscription.paymentMethod,
            currency: subscription.currency,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getHistory(req, res) {
  try {
    const user = await User.findById(req.user._id).select('plan trialEndsAt createdAt');
    const payments = await Payment.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
    const history = [];
    if (user && user.trialEndsAt) {
      history.push({
        id: 'trial-start',
        type: 'trial_start',
        amount: 0,
        currency: null,
        date: user.createdAt,
        description: 'Free trial started',
        status: 'succeeded',
      });
    }
    for (const p of payments) {
      history.push({
        id: p._id,
        type: 'subscription',
        amount: p.amount,
        currency: p.currency,
        date: p.paidAt || p.createdAt,
        description: `${p.paymentMethod} payment`,
        status: p.status,
      });
    }
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateSettings(req, res) {
  try {
    const { plan } = req.body;
    const update = {};
    if (plan && typeof plan === 'string' && plan.trim()) {
      update.plan = plan.trim();
      if (plan !== 'free_trial') {
        update.subscriptionStatus = 'active';
        update.trialEndsAt = null;
      }
    }
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const planConfig = await resolvePlanConfig(user.plan);
    res.json({
      plan: user.plan,
      planName: planConfig.name,
      trialEndsAt: user.trialEndsAt,
      subscriptionStatus: user.subscriptionStatus,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listPlans(req, res) {
  try {
    const plans = await Plan.find({ active: true }).sort({ order: 1, slug: 1 }).lean();
    if (plans.length > 0) {
      return res.json(plans.map((p) => ({ ...p, id: p.slug })));
    }
    res.json(PLANS);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getBankDetails(req, res) {
  try {
    const { currency } = req.query;
    if (!currency || !CURRENCIES.includes(currency)) {
      return res.status(400).json({ message: 'currency required (USD, EUR, or GBP)' });
    }
    const { planId } = req.query;
    const account = await BankAccount.findOne({ currency, active: true });
    if (!account) return res.status(404).json({ message: 'Bank details not configured for this currency' });
    let price = null;
    if (planId) {
      const planConfig = await resolvePlanConfig(planId);
      price = planConfig?.prices?.[currency] || getPriceForPlan(planId, currency);
    }
    const amountMajor = price ? (price.amount / 100).toFixed(2) : null;
    res.json({
      currency,
      accountName: account.accountName,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      iban: account.iban,
      swiftBic: account.swiftBic,
      reference: account.reference,
      instructions: account.instructions,
      amount: amountMajor,
      amountMinor: price ? price.amount : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function bankTransferRequest(req, res) {
  try {
    const { planId, currency } = req.body;
    if (!planId || !currency || !CURRENCIES.includes(currency)) {
      return res.status(400).json({ message: 'planId and currency (USD, EUR, GBP) required' });
    }
    const plan = await resolvePlanConfig(planId);
    if (!plan || !plan.prices || !plan.prices[currency]) {
      return res.status(400).json({ message: 'Invalid plan or currency' });
    }
    const price = plan.prices[currency];
    const reference = `StoreHub-${req.user._id}-${Date.now()}`;
    const payment = await Payment.create({
      userId: req.user._id,
      amount: price.amount,
      currency: price.currency,
      status: 'pending',
      paymentMethod: 'bank_transfer',
      externalId: reference,
      metadata: { planId: plan.id, reference },
    });
    const account = await BankAccount.findOne({ currency, active: true });
    if (!account) return res.status(503).json({ message: 'Bank transfer not available for this currency' });
    res.status(201).json({
      paymentId: payment._id,
      reference,
      amount: (price.amount / 100).toFixed(2),
      currency: price.currency,
      accountName: account.accountName,
      bankName: account.bankName,
      iban: account.iban,
      swiftBic: account.swiftBic,
      instructions: account.instructions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function bankTransferProof(req, res) {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ message: 'paymentId required' });
    const payment = await Payment.findOne({ _id: paymentId, userId: req.user._id });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (payment.status !== 'pending' || payment.paymentMethod !== 'bank_transfer') {
      return res.status(400).json({ message: 'Payment is not a pending bank transfer' });
    }
    const file = req.files?.proof || req.files?.file;
    let proofUrl = null;
    if (file && (file.mimetype?.startsWith('image/') || file.mimetype === 'application/pdf')) {
      const cloudinary = require('cloudinary').v2;
      const data = file.data || (file.tempFilePath ? undefined : null);
      const result = data
        ? await cloudinary.uploader.upload(
            `data:${file.mimetype};base64,${data.toString('base64')}`,
            { folder: 'storehub-proofs', resource_type: 'auto' }
          )
        : await cloudinary.uploader.upload(file.tempFilePath, { folder: 'storehub-proofs', resource_type: 'auto' });
      proofUrl = result.secure_url;
    }
    if (!proofUrl) return res.status(400).json({ message: 'Upload a proof file (image or PDF)' });
    payment.metadata = payment.metadata || {};
    payment.metadata.proofUrl = proofUrl;
    await payment.save();
    let sub = await Subscription.findOne({ userId: req.user._id });
    if (sub) {
      sub.bankTransferProofUrl = proofUrl;
      await sub.save();
    }
    res.json({ message: 'Proof uploaded. We will verify and activate your subscription shortly.', proofUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function createCheckoutSession(req, res) {
  try {
    const { planId, currency } = req.body;
    if (!planId || !currency) return res.status(400).json({ message: 'planId and currency required' });
    const user = await User.findById(req.user._id).select('email');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
    const base = baseUrl.replace(/\/$/, '');
    const stripeService = require('../services/stripeService');
    const { url } = await stripeService.createCheckoutSession({
      userId: req.user._id,
      userEmail: user.email,
      planId,
      currency,
      successUrl: `${base}/billing?success=true`,
      cancelUrl: `${base}/billing?canceled=true`,
    });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Stripe checkout failed' });
  }
}

async function createPortalSession(req, res) {
  try {
    const sub = await Subscription.findOne({ userId: req.user._id });
    if (!sub || !sub.stripeCustomerId) return res.status(400).json({ message: 'No Stripe subscription found. Subscribe first.' });
    const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
    const stripeService = require('../services/stripeService');
    const { url } = await stripeService.createPortalSession({
      customerId: sub.stripeCustomerId,
      returnUrl: `${baseUrl.replace(/\/$/, '')}/billing`,
    });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Portal session failed' });
  }
}

async function createFlutterwavePayment(req, res) {
  try {
    const { planId, currency } = req.body;
    if (!planId || !currency) return res.status(400).json({ message: 'planId and currency required' });
    const user = await User.findById(req.user._id).select('email fullName');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
    const redirectUrl = `${baseUrl.replace(/\/$/, '')}/billing?success=true`;
    const flutterwaveService = require('../services/flutterwaveService');
    const { url, txRef, amount, currency: curr } = await flutterwaveService.initializePayment({
      userId: req.user._id,
      planId,
      currency,
      customerEmail: user.email,
      customerName: user.fullName,
      redirectUrl,
    });
    res.json({ url, txRef, amount, currency: curr });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Flutterwave payment init failed' });
  }
}

module.exports = {
  getPlan,
  getHistory,
  updateSettings,
  listPlans,
  getBankDetails,
  bankTransferRequest,
  bankTransferProof,
  createCheckoutSession,
  createPortalSession,
  createFlutterwavePayment,
};
