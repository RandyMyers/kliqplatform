const express = require('express');
const router = express.Router();
const marketingController = require('../controllers/marketingController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/stats', marketingController.getStats);
router.get('/campaigns', marketingController.listCampaigns);

module.exports = router;
