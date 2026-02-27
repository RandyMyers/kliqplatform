const express = require('express');
const router = express.Router();
const exchangeRateService = require('../services/exchangeRateService');

router.get('/', async (req, res) => {
  try {
    const data = await exchangeRateService.getRates();
    res.json({
      base: data.base,
      rates: data.rates,
      updatedAt: data.updatedAt,
      supported: exchangeRateService.SUPPORTED,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch rates' });
  }
});

router.get('/convert', async (req, res) => {
  try {
    const amount = parseInt(req.query.amount, 10);
    const from = req.query.from || 'USD';
    const to = req.query.to || 'USD';
    if (isNaN(amount) || amount < 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    await exchangeRateService.getRates();
    const converted = exchangeRateService.convert(amount, from, to);
    if (converted == null) {
      return res.status(400).json({ message: 'Conversion failed' });
    }
    res.json({
      amount,
      from,
      to,
      converted,
      convertedMajor: (converted / 100).toFixed(2),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Conversion failed' });
  }
});

module.exports = router;
