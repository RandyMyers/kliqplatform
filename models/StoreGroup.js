const mongoose = require('mongoose');

const storeGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    storeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StoreGroup', storeGroupSchema);
