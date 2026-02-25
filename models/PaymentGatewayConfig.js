const mongoose = require('mongoose');

const paymentGatewayConfigSchema = new mongoose.Schema(
  {
    gateway: { type: String, required: true, unique: true, enum: ['stripe', 'flutterwave'] },
    encryptedCredentials: { type: String, required: true },
    isLive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentGatewayConfig', paymentGatewayConfigSchema);
