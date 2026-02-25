const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/stats', orderController.stats);
router.get('/', orderController.list);
router.get('/:id', orderController.getById);
router.put('/:id/status', orderController.updateStatus);

module.exports = router;
