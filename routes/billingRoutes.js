const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/plan', billingController.getPlan);
router.get('/plans', billingController.listPlans);
router.get('/history', billingController.getHistory);
router.put('/settings', billingController.updateSettings);
router.get('/bank-details', billingController.getBankDetails);
router.post('/bank-transfer-request', billingController.bankTransferRequest);
router.post('/bank-transfer-proof', billingController.bankTransferProof);
router.post('/create-checkout-session', billingController.createCheckoutSession);
router.post('/create-portal-session', billingController.createPortalSession);
router.post('/create-flutterwave-payment', billingController.createFlutterwavePayment);

module.exports = router;
