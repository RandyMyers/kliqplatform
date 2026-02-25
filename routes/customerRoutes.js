const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/stats', customerController.stats);
router.get('/', customerController.list);
router.get('/:id/orders', customerController.getOrderHistory);
router.get('/:id', customerController.getById);

module.exports = router;
