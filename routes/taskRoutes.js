const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/stats', taskController.stats);
router.get('/', taskController.list);
router.post('/', taskController.create);
router.get('/:id', taskController.getById);
router.put('/:id', taskController.update);
router.delete('/:id', taskController.remove);

module.exports = router;
