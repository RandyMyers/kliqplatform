const axios = require('axios');
const crypto = require('crypto');
const PaymentGatewayConfig = require('../models/PaymentGatewayConfig');
const { decryptPaymentCreds } = require('./paymentEncryption');
const { getPlanById, getPriceForPlan, CURRENCIES } = require('../config/plans');

const FLW_BASE = 'https://api.flutterwave.com/v3';

let _secretKey = null;
let _webhookHash = null;

async function getCredentials() {
  if (_secretKey) return { secretKey: _secretKey, webhookHash: _webhookHash };
  const fromEnv = process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_SECRET_KEY;
  if (fromEnv) {
    _secretKey = fromEnv;
    _webhookHash = process.env.FLUTTERWAVE_WEBHOOK_HASH || process.env.FLW_WEBHOOK_HASH || null;
    return { secretKey: _secretKey, webhookHash: _webhookHash };
  }
  const config = await PaymentGatewayConfig.findOne({ gateway: 'flutterwave' });
  if (!config || !config.encryptedCredentials) return null;
  const raw = decryptPaymentCreds(config.encryptedCredentials);
  if (!raw) return null;
  const creds = JSON.parse(raw);
  _secretKey = creds.secretKey;
  _webhookHash = creds.webhookHash || null;
  return { secretKey: _secretKey, webhookHash: _webhookHash };
}

/**
 * Initialize a Flutterwave payment (see flutterwave.txt).
 * Returns the payment link URL for the user to complete payment.
 * We manage plans/subscriptions ourselves; this is a one-time payment.
 */
async function initializePayment({ userId, planId, currency, customerEmail, customerName, redirectUrl }) {
  const creds = await getCredentials();
  if (!creds || !creds.secretKey) throw new Error('Flutterwave is not configured');
  if (!CURRENCIES.includes(currency)) throw new Error('Invalid currency');
  const plan = getPlanById(planId);
  const price = getPriceForPlan(planId, currency);
  if (!plan || !price || plan.id === 'free_trial') throw new Error('Invalid plan or currency');

  const txRef = `storehub-${userId}-${Date.now()}`;
  const amount = price.amount / 100;
  const payload = {
    tx_ref: txRef,
    amount: amount,
    currency: currency,
    redirect_url: redirectUrl,
    customer: {
      email: customerEmail,
      name: customerName || 'Customer',
      phonenumber: '',
    },
    customizations: {
      title: 'StoreHub',
      description: `${plan.name} – ${currency} ${amount}`,
    },
    meta: { userId: String(userId), planId, currency },
  };

  const res = await axios.post(`${FLW_BASE}/payments`, payload, {
    headers: {
      Authorization: `Bearer ${creds.secretKey}`,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });

  if (res.status !== 200 || !res.data) throw new Error(res.data?.message || 'Flutterwave payment init failed');
  const status = res.data.status;
  const data = res.data.data;
  if (status !== 'success' || !data?.link) throw new Error(res.data.message || 'No payment link returned');
  return { url: data.link, txRef, amount, currency };
}

/**
 * Verify webhook payload using Flutterwave secret hash (if configured).
 * They send verification_hash in the payload; we recompute and compare.
 */
function verifyWebhookPayload(payload, secretHash) {
  if (!secretHash) return true;
  const hash = payload.verification_hash || payload.flw_verification_hash;
  if (!hash) return false;
  const toVerify = payload;
  const sorted = JSON.stringify(toVerify, Object.keys(toVerify).sort());
  const computed = crypto.createHmac('sha256', secretHash).update(sorted).digest('hex');
  return computed === hash;
}

async function getWebhookSecretHash() {
  const creds = await getCredentials();
  return creds?.webhookHash || process.env.FLUTTERWAVE_WEBHOOK_HASH || process.env.FLW_WEBHOOK_HASH;
}

module.exports = {
  getCredentials,
  initializePayment,
  verifyWebhookPayload,
  getWebhookSecretHash,
};
