const { body } = require('express-validator');

const login = [
  body('email').trim().isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

const signup = [
  body('fullName').trim().notEmpty().withMessage('Full name required').isLength({ max: 200 }).withMessage('Full name too long'),
  body('email').trim().isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const forgotPassword = [
  body('email').trim().isEmail().withMessage('Valid email required'),
];

const resetPassword = [
  body('token').notEmpty().withMessage('Reset token required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

module.exports = { login, signup, forgotPassword, resetPassword };
