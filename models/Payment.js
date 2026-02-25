const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['succeeded', 'pending', 'failed', 'refunded'],
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['stripe', 'flutterwave', 'bank_transfer'],
    },
    externalId: { type: String },
    paidAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ externalId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
