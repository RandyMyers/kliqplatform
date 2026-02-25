const mongoose = require('mongoose');

const replySchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isStaff: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true },
    message: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      default: 'open',
      enum: ['open', 'in-progress', 'resolved', 'closed'],
    },
    priority: { type: String, default: 'medium', enum: ['low', 'medium', 'high'] },
    replies: [replySchema],
  },
  { timestamps: true }
);

supportTicketSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
