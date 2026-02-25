const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema(
  {
    email: { type: String },
    role: {
      type: String,
      required: true,
      enum: ['admin', 'manager', 'user'],
      default: 'user',
    },
    message: { type: String },
    token: { type: String, required: true, unique: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true }
);

inviteSchema.index({ token: 1 }, { unique: true });
inviteSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Invite', inviteSchema);

