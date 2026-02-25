const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    platform: {
      type: String,
      enum: ['woocommerce', 'shopify'],
      default: 'woocommerce',
    },
    credentialsEncrypted: { type: String },
    status: { type: String, default: 'online', enum: ['online', 'offline', 'maintenance'] },
    admin: { type: String },
    location: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ordersToday: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    lastSync: { type: Date },
  },
  { timestamps: true }
);

storeSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Store', storeSchema);
