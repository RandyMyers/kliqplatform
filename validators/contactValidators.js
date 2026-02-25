const { body } = require('express-validator');

const submit = [
  body('name').trim().notEmpty().withMessage('Name required').isLength({ max: 200 }).withMessage('Name too long'),
  body('email').trim().isEmail().withMessage('Valid email required'),
  body('company').optional().trim().isLength({ max: 200 }).withMessage('Company too long'),
  body('message').trim().notEmpty().withMessage('Message required').isLength({ max: 10000 }).withMessage('Message too long'),
];

module.exports = { submit };
