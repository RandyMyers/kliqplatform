const express = require('express');
const router = express.Router();
const conversationsController = require('../controllers/conversationsController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', conversationsController.list);
router.post('/', conversationsController.create);
router.get('/:id', conversationsController.getById);
router.post('/:id/messages', conversationsController.addMessage);
router.put('/:id/status', conversationsController.updateStatus);

module.exports = router;
