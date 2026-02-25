const express = require('express');
const stripeWebhookController = require('../controllers/stripeWebhookController');
const flutterwaveWebhookController = require('../controllers/flutterwaveWebhookController');

const router = express.Router();

router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhookController.stripeWebhook
);

router.post(
  '/flutterwave',
  express.json(),
  flutterwaveWebhookController.flutterwaveWebhook
);

module.exports = router;