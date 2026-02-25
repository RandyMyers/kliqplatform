const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    limits: { type: mongoose.Schema.Types.Mixed, default: {} },
    features: [{ type: String }],
    prices: {
      USD: { amount: Number, currency: { type: String, default: 'USD' } },
      EUR: { amount: Number, currency: { type: String, default: 'EUR' } },
      GBP: { amount: Number, currency: { type: String, default: 'GBP' } },
    },
    interval: { type: String, default: 'month', enum: ['month', 'year'] },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    stripePriceId: { type: mongoose.Schema.Types.Mixed, default: {} },
    flutterwavePlanId: { type: String },
  },
  { timestamps: true }
);

planSchema.index({ order: 1, slug: 1 });

module.exports = mongoose.model('Plan', planSchema);
