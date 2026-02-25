const mongoose = require('mongoose');

const supportArticleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    body: { type: String, default: '' },
    category: { type: String, default: 'General' },
    order: { type: Number, default: 0 },
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);

supportArticleSchema.index({ published: 1, category: 1 });

module.exports = mongoose.model('SupportArticle', supportArticleSchema);
