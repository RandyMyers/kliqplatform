const mongoose = require('mongoose');

const forumReplySchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumPost', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true },
  },
  { timestamps: true }
);

forumReplySchema.index({ postId: 1, createdAt: 1 });

module.exports = mongoose.model('ForumReply', forumReplySchema);
