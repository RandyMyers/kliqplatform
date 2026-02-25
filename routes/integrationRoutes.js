const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const integrationController = require('../controllers/integrationController');

const router = express.Router();

router.use(authMiddleware);

router.get(
  '/woocommerce/:storeId/products',
  integrationController.listWooCommerceProducts
);

router.get(
  '/shopify/:storeId/products',
  integrationController.listShopifyProducts
);

router.post(
  '/products/import',
  integrationController.importProducts
);

module.exports = router;

