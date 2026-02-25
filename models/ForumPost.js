const mongoose = require('mongoose');

const forumPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumCategory', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pinned: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

forumPostSchema.index({ categoryId: 1, createdAt: -1 });

module.exports = mongoose.model('ForumPost', forumPostSchema);
