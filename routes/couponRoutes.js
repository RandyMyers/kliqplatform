const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', couponController.list);
router.post('/', couponController.create);
router.get('/:id', couponController.getById);
router.put('/:id', couponController.update);
router.delete('/:id', couponController.remove);

module.exports = router;
