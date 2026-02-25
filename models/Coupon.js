const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    discountType: { type: String, required: true, enum: ['percent', 'fixed'] },
    discountValue: { type: Number, required: true },
    description: { type: String },
    validFrom: { type: Date },
    validTo: { type: Date },
    usageLimit: { type: Number },
    usedCount: { type: Number, default: 0 },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Sync: platform id and source (for upsert and display)
    externalId: { type: String },
    platform: { type: String, enum: ['shopify', 'woocommerce'] },
    priceRuleId: { type: String }, // Shopify: parent price rule id
  },
  { timestamps: true }
);

couponSchema.index({ userId: 1, code: 1 });
couponSchema.index({ storeId: 1 });
couponSchema.index({ storeId: 1, externalId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Coupon', couponSchema);
