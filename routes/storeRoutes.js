const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/stats', storeController.stats);
router.get('/groups', storeController.listGroups);
router.post('/groups', storeController.createGroup);
router.get('/', storeController.list);
router.post('/', storeController.create);
router.get('/:id', storeController.getById);
router.put('/:id', storeController.update);
router.delete('/:id', storeController.remove);
router.post('/:id/sync/products', storeController.syncProducts);
router.post('/:id/sync/orders', storeController.syncOrders);
router.post('/:id/sync/customers', storeController.syncCustomers);
router.post('/:id/sync/coupons', storeController.syncCoupons);
router.post('/:id/sync/all', storeController.syncAll);
router.post('/:id/sync/inventory', storeController.syncInventory);

module.exports = router;
