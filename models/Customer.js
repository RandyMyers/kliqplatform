const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    location: { type: String },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    externalId: { type: String },
    orders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastOrder: { type: Date },
    tags: [{ type: String }],
    status: { type: String, default: 'active', enum: ['active', 'inactive'] },
    addresses: [{
      address1: String,
      address2: String,
      city: String,
      state: String,
      zip: String,
      country: String,
      phone: String,
    }],
    defaultAddressIndex: { type: Number, default: 0 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

customerSchema.index({ storeId: 1, externalId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Customer', customerSchema);
