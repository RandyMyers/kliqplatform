const express = require('express');
const router = express.Router();
const Plan = require('../models/Plan');
const { PLANS } = require('../config/plans');

router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.find({ active: true }).sort({ order: 1, slug: 1 }).lean();
    if (plans.length > 0) {
      return res.json(plans.map((p) => ({ ...p, id: p.slug })));
    }
    res.json(PLANS);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
