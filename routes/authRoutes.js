const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const { login, signup, forgotPassword, resetPassword } = require('../validators/authValidators');

router.post('/login', login, handleValidation, authController.login);
router.post('/signup', signup, handleValidation, authController.signup);
router.post('/forgot-password', forgotPassword, handleValidation, authController.forgotPassword);
router.post('/reset-password', resetPassword, handleValidation, authController.resetPassword);
router.get('/me', authMiddleware, authController.me);
router.put('/me', authMiddleware, authController.updateMe);

module.exports = router;
