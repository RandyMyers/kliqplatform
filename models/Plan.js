const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    limits: { type: mongoose.Schema.Types.Mixed, default: {} },
    features: [{ type: String }],
    prices: {
      USD: { type: mongoose.Schema.Types.Mixed },
      EUR: { type: mongoose.Schema.Types.Mixed },
      GBP: { type: mongoose.Schema.Types.Mixed },
    },
    interval: { type: String, default: 'month', enum: ['month', 'quarter', 'half_year', 'year'] },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    stripePriceId: { type: mongoose.Schema.Types.Mixed, default: {} },
    flutterwavePlanId: { type: String },
  },
  { timestamps: true }
);

planSchema.index({ order: 1, slug: 1 });

module.exports = mongoose.model('Plan', planSchema);
