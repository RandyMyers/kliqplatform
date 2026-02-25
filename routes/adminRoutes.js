const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/requireAdmin');

router.use(requireAdmin);

router.get('/stats', adminController.getStats);
router.get('/analytics/trends', adminController.getAnalyticsTrends);
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUser);
router.post('/users', adminController.createUser);
router.patch('/users/:id', adminController.updateUser);

router.get('/payment-config', adminController.getPaymentConfig);
router.put('/payment-config/stripe', adminController.updateStripeConfig);
router.put('/payment-config/flutterwave', adminController.updateFlutterwaveConfig);
router.get('/payment-config/stripe/status', adminController.getStripeCredentials);
router.get('/payment-config/flutterwave/status', adminController.getFlutterwaveCredentials);

router.get('/bank-accounts', adminController.listBankAccounts);
router.put('/bank-accounts', adminController.upsertBankAccount);

router.get('/subscriptions', adminController.listSubscriptions);
router.get('/subscriptions/:id', adminController.getSubscription);
router.patch('/subscriptions/:id', adminController.updateSubscription);
router.post('/subscriptions/:id/cancel', adminController.cancelSubscription);
router.post('/users/:id/extend-trial', adminController.extendTrial);

router.get('/payments', adminController.listPayments);
router.get('/payments/export', adminController.exportPayments);
router.get('/payments/pending', adminController.listPendingPayments);
router.get('/payments/:id', adminController.getPayment);
router.put('/payments/:id/verify', adminController.verifyBankPayment);
router.post('/payments/:id/refund', adminController.refundPayment);

router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);
router.get('/audit-log', adminController.listAuditLogs);
router.get('/support-articles', adminController.listSupportArticles);
router.get('/support-articles/:id', adminController.getSupportArticle);
router.post('/support-articles', adminController.createSupportArticle);
router.put('/support-articles/:id', adminController.updateSupportArticle);
router.delete('/support-articles/:id', adminController.deleteSupportArticle);
router.get('/tickets', adminController.listTickets);
router.get('/tickets/:id', adminController.getTicket);
router.get('/stores', adminController.listStores);
router.get('/orders', adminController.listOrders);
router.get('/orders/:id', adminController.getOrder);
router.get('/products', adminController.listProducts);
router.get('/products/:id', adminController.getProduct);
router.patch('/products/:id', adminController.updateProduct);
router.patch('/tickets/:id', adminController.updateTicket);
router.post('/tickets/:id/replies', adminController.addTicketReply);

router.get('/blog', adminController.listBlogPosts);
router.post('/blog', adminController.createBlogPost);
router.get('/blog/:id', adminController.getBlogPost);
router.put('/blog/:id', adminController.updateBlogPost);
router.delete('/blog/:id', adminController.deleteBlogPost);

router.get('/plans', adminController.listPlans);
router.get('/plans/:id', adminController.getPlan);
router.post('/plans', adminController.createPlan);
router.put('/plans/:id', adminController.updatePlan);
router.delete('/plans/:id', adminController.deletePlan);

module.exports = router;
