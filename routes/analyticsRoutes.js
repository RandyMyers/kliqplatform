const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/overview', analyticsController.overview);
router.get('/sales', analyticsController.sales);
router.get('/orders', analyticsController.ordersChart);
router.get('/revenue-by-store', analyticsController.revenueByStore);

module.exports = router;
