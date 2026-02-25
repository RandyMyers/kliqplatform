const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    plan: { type: String, required: true },
    status: {
      type: String,
      default: 'active',
      enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired'],
    },
    currency: { type: String, enum: ['USD', 'EUR', 'GBP'] },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    stripePriceId: { type: String },
    flutterwaveSubscriptionId: { type: String },
    flutterwaveCustomerId: { type: String },
    paymentMethod: {
      type: String,
      enum: ['stripe', 'flutterwave', 'bank_transfer'],
    },
    bankTransferProofUrl: { type: String },
    bankTransferVerifiedAt: { type: Date },
  },
  { timestamps: true }
);

subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
