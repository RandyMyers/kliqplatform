const express = require('express');
const router = express.Router();
const extensionsController = require('../controllers/extensionsController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.get('/', extensionsController.list);

module.exports = router;
