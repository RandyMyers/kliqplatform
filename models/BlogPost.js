const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, trim: true, sparse: true },
    excerpt: { type: String, default: '' },
    body: { type: String, default: '' },
    author: { type: String, default: 'StoreHub' },
    published: { type: Boolean, default: false },
    publishedAt: { type: Date },
    order: { type: Number, default: 0 },
    // Per-language translations (e.g. en, es, fr, de). Keys = language code.
    titleTranslations: { type: Map, of: String, default: undefined },
    bodyTranslations: { type: Map, of: String, default: undefined },
    excerptTranslations: { type: Map, of: String, default: undefined },
    metaTitleTranslations: { type: Map, of: String, default: undefined },
    metaDescriptionTranslations: { type: Map, of: String, default: undefined },
  },
  { timestamps: true }
);

blogPostSchema.index({ published: 1, publishedAt: -1 });
blogPostSchema.index({ slug: 1 }, { unique: true, sparse: true });

function slugify(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

blogPostSchema.pre('save', function (next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = slugify(this.title);
  }
  if (this.isModified('published') && this.published && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('BlogPost', blogPostSchema);
