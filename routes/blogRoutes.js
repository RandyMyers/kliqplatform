const express = require('express');
const router = express.Router();
const BlogPost = require('../models/BlogPost');

/**
 * Resolve translated field: translation map for lang, or fallback to default field.
 * Handles both Map (from doc) and plain object (from lean()).
 */
function translated(post, lang, field, translationsKey) {
  const map = post[translationsKey];
  const val = map && (typeof map.get === 'function' ? map.get(lang) : map[lang]);
  return (val && String(val).trim()) ? String(val) : (post[field] || '');
}

/**
 * Apply ?lang= to a post: return object with title, excerpt, body (and meta for SEO) for that language.
 */
function toTranslatedPost(post, lang) {
  if (!lang) return post;
  const title = translated(post, lang, 'title', 'titleTranslations');
  const excerpt = translated(post, lang, 'excerpt', 'excerptTranslations');
  const body = translated(post, lang, 'body', 'bodyTranslations');
  const metaTitle = translated(post, lang, 'title', 'metaTitleTranslations') || title;
  const metaDescMap = post.metaDescriptionTranslations;
  const metaDescription = (metaDescMap && (typeof metaDescMap.get === 'function' ? metaDescMap.get(lang) : metaDescMap[lang])) || excerpt;
  return {
    ...post,
    title,
    excerpt,
    body,
    meta: { title: metaTitle, description: metaDescription },
  };
}

// Public: list published blog posts (for landing page). Query: ?lang= (e.g. en, es, fr, de)
router.get('/', async (req, res) => {
  try {
    const lang = (req.query.lang && String(req.query.lang).trim()) || null;
    const posts = await BlogPost.find({ published: true })
      .sort({ publishedAt: -1, order: 1, createdAt: -1 })
      .select('title slug excerpt author publishedAt createdAt titleTranslations excerptTranslations')
      .lean();
    const list = posts.map((p) => {
      const out = { ...p };
      if (lang) {
        out.title = translated(p, lang, 'title', 'titleTranslations');
        out.excerpt = translated(p, lang, 'excerpt', 'excerptTranslations');
      }
      if (out.titleTranslations) delete out.titleTranslations;
      if (out.excerptTranslations) delete out.excerptTranslations;
      return out;
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Public: get single published post by id or slug. Query: ?lang= for translated content and SEO meta
router.get('/:idOrSlug', async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const lang = (req.query.lang && String(req.query.lang).trim()) || null;
    const isId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);
    const post = await BlogPost.findOne(
      isId ? { _id: idOrSlug, published: true } : { slug: idOrSlug, published: true }
    ).lean();
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const out = toTranslatedPost(post, lang);
    if (out.titleTranslations) delete out.titleTranslations;
    if (out.bodyTranslations) delete out.bodyTranslations;
    if (out.excerptTranslations) delete out.excerptTranslations;
    if (out.metaTitleTranslations) delete out.metaTitleTranslations;
    if (out.metaDescriptionTranslations) delete out.metaDescriptionTranslations;
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
