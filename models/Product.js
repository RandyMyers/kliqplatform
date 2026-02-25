const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sku: { type: String },
    price: { type: Number, required: true },
    salePrice: { type: Number },
    stock: { type: Number, default: 0 },
    status: { type: String, default: 'in_stock', enum: ['in_stock', 'low_stock', 'out_of_stock'] },
    reviewStatus: { type: String, enum: ['approved', 'pending_review', 'rejected'], default: 'approved' },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    externalId: { type: String },
    category: { type: String },
    productType: { type: String },
    vendor: { type: String },
    image: { type: String },
    description: { type: String },
    shortDescription: { type: String },
    weight: { type: Number },
    dimensions: { type: String },
    tags: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

productSchema.index({ storeId: 1, externalId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Product', productSchema);
