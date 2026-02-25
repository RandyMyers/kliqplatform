const ForumCategory = require('../models/ForumCategory');
const ForumPost = require('../models/ForumPost');
const ForumReply = require('../models/ForumReply');

const DEFAULT_CATEGORIES = [
  { name: 'General', slug: 'general', order: 1 },
  { name: 'Getting Started', slug: 'getting-started', order: 2 },
  { name: 'Integrations', slug: 'integrations', order: 3 },
  { name: 'Billing & Plans', slug: 'billing', order: 4 },
];

async function ensureCategories() {
  const count = await ForumCategory.countDocuments();
  if (count === 0) {
    await ForumCategory.insertMany(DEFAULT_CATEGORIES);
  }
}

async function listCategories(req, res) {
  try {
    await ensureCategories();
    const categories = await ForumCategory.find().sort({ order: 1 }).lean();
    const counts = await ForumPost.aggregate([
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach((c) => { countMap[c._id.toString()] = c.count; });
    const result = categories.map((cat) => ({
      _id: cat._id,
      id: cat._id.toString(),
      name: cat.name,
      slug: cat.slug,
      count: countMap[cat._id.toString()] || 0,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listPosts(req, res) {
  try {
    const { categoryId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (categoryId) filter.categoryId = categoryId;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(50, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const posts = await ForumPost.find(filter)
      .sort({ pinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('categoryId', 'name slug')
      .populate('authorId', 'fullName email')
      .lean();
    const postIds = posts.map((p) => p._id);
    const replyCounts = await ForumReply.aggregate([
      { $match: { postId: { $in: postIds } } },
      { $group: { _id: '$postId', count: { $sum: 1 } } },
    ]);
    const replyMap = {};
    replyCounts.forEach((r) => { replyMap[r._id.toString()] = r.count; });
    const result = posts.map((p) => ({
      _id: p._id,
      id: p._id.toString(),
      title: p.title,
      body: p.body,
      categoryId: p.categoryId?._id,
      category: p.categoryId?.name,
      authorId: p.authorId?._id,
      author: p.authorId?.fullName || p.authorId?.email || 'Unknown',
      replies: replyMap[p._id.toString()] || 0,
      pinned: p.pinned,
      locked: p.locked,
      createdAt: p.createdAt,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getPostById(req, res) {
  try {
    const post = await ForumPost.findById(req.params.id)
      .populate('categoryId', 'name slug')
      .populate('authorId', 'fullName email')
      .lean();
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const replies = await ForumReply.find({ postId: post._id })
      .sort({ createdAt: 1 })
      .populate('authorId', 'fullName email')
      .lean();
    res.json({
      _id: post._id,
      id: post._id.toString(),
      title: post.title,
      body: post.body,
      categoryId: post.categoryId?._id,
      category: post.categoryId?.name,
      authorId: post.authorId?._id,
      author: post.authorId?.fullName || post.authorId?.email || 'Unknown',
      pinned: post.pinned,
      locked: post.locked,
      createdAt: post.createdAt,
      replies: replies.map((r) => ({
        _id: r._id,
        body: r.body,
        authorId: r.authorId?._id,
        author: r.authorId?.fullName || r.authorId?.email || 'Unknown',
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function createPost(req, res) {
  try {
    const { title, body, categoryId } = req.body;
    if (!title || !body || !categoryId) {
      return res.status(400).json({ message: 'title, body, and categoryId required' });
    }
    const post = await ForumPost.create({
      title: title.trim(),
      body: body.trim(),
      categoryId,
      authorId: req.user._id,
    });
    const populated = await ForumPost.findById(post._id)
      .populate('categoryId', 'name slug')
      .populate('authorId', 'fullName email')
      .lean();
    res.status(201).json({
      _id: populated._id,
      id: populated._id.toString(),
      title: populated.title,
      body: populated.body,
      category: populated.categoryId?.name,
      author: populated.authorId?.fullName || populated.authorId?.email || 'Unknown',
      createdAt: populated.createdAt,
      replies: 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function createReply(req, res) {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ message: 'body required' });
    }
    const post = await ForumPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.locked) return res.status(400).json({ message: 'Post is locked' });
    const reply = await ForumReply.create({
      postId: post._id,
      authorId: req.user._id,
      body: body.trim(),
    });
    const populated = await ForumReply.findById(reply._id).populate('authorId', 'fullName email').lean();
    res.status(201).json({
      _id: populated._id,
      body: populated.body,
      author: populated.authorId?.fullName || populated.authorId?.email || 'Unknown',
      createdAt: populated.createdAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  listCategories,
  listPosts,
  getPostById,
  createPost,
  createReply,
};
