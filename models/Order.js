const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true },
    externalId: { type: String },
    date: { type: Date, default: Date.now },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    total: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    note: { type: String },
    shippingAddress: { type: mongoose.Schema.Types.Mixed },
    billingAddress: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, default: 'pending', enum: ['processing', 'pending', 'completed', 'cancelled', 'refunded'] },
    payment: { type: String, default: 'pending', enum: ['paid', 'pending', 'refunded'] },
    financialStatus: { type: String },
    fulfillmentStatus: { type: String },
    subtotal: { type: Number },
    taxTotal: { type: Number, default: 0 },
    items: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    shippingLines: [{ title: String, amount: Number }],
    discountCodes: [{ code: String, amount: Number }],
    refunds: [{ amount: Number, reason: String, refundedAt: Date }],
    lineItems: [{ name: String, quantity: Number, price: Number, productId: String, variantId: String }],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

orderSchema.index({ storeId: 1, externalId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Order', orderSchema);
