const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  body: { type: String, required: true },
  sender: { type: String, enum: ['user', 'contact'], required: true },
  createdAt: { type: Date, default: Date.now },
});

const conversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, default: '' },
    contactName: { type: String },
    contactEmail: { type: String },
    status: { type: String, default: 'open', enum: ['open', 'closed'] },
    messages: [messageSchema],
  },
  { timestamps: true }
);

conversationSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
