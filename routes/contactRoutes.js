const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { handleValidation } = require('../middleware/validate');
const { submit: submitValidators } = require('../validators/contactValidators');

router.post('/', submitValidators, handleValidation, contactController.submit);

module.exports = router;
