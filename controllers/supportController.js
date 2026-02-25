const SupportTicket = require('../models/SupportTicket');
const SupportArticle = require('../models/SupportArticle');

const DEFAULT_ARTICLES = [
  { title: 'Getting started with StoreHub', description: 'Learn how to connect your first store, import products, and configure basic settings.', body: 'Connect your store from the Stores page, then sync products and orders. Use Get Started for a guided setup.', category: 'Setup', order: 1 },
  { title: 'Managing orders and fulfillment', description: 'Process orders, update statuses, and sync with your e-commerce platform.', body: 'View orders in the Orders tab. You can filter by store and date. Open any order to see details and update fulfillment status.', category: 'Orders', order: 2 },
  { title: 'Coupons and promotions', description: 'Create and manage discount codes, set usage limits, and track redemption.', body: 'Go to Coupons to create codes. Set amount or percentage, usage limits, and optional expiry. Redemptions appear in order details.', category: 'Marketing', order: 3 },
  { title: 'Team and user permissions', description: 'Invite team members, assign roles, and control access to stores and features.', body: 'Use the Users page to invite team members and assign roles. Permissions are applied per user.', category: 'Account', order: 4 },
  { title: 'Billing and subscription', description: 'Update payment methods, change plans, and view invoice history.', body: 'Visit Billing to see your plan, update payment method via the secure portal, and view payment history.', category: 'Billing', order: 5 },
  { title: 'Integrations (WooCommerce, Shopify)', description: 'Connect WooCommerce or Shopify stores and keep products in sync.', body: 'Add a store and choose WooCommerce or Shopify. Enter your store URL and API credentials. Sync runs automatically or on demand.', category: 'Integrations', order: 6 },
];

async function list(req, res) {
  try {
    const { status } = req.query;
    const filter = { userId: req.user._id };
    if (status) filter.status = status;
    const tickets = await SupportTicket.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const { subject, message, priority } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ message: 'Subject and message required' });
    }
    const ticket = await SupportTicket.create({
      subject,
      message,
      priority: priority || 'medium',
      userId: req.user._id,
    });
    res.status(201).json(ticket);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getById(req, res) {
  try {
    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const { status, priority } = req.body;
    const update = {};
    if (status) update.status = status;
    if (priority) update.priority = priority;
    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      update,
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function addReply(req, res) {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ message: 'message required' });

    const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user._id });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    ticket.replies = ticket.replies || [];
    ticket.replies.push({
      message: message.trim(),
      userId: req.user._id,
      isStaff: false,
    });
    await ticket.save();

    const updated = await SupportTicket.findById(ticket._id).lean();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listArticles(req, res) {
  try {
    const { category, search } = req.query;
    if ((await SupportArticle.countDocuments({ published: true })) === 0) {
      await SupportArticle.insertMany(DEFAULT_ARTICLES.map((a, i) => ({ ...a, order: i + 1 })));
    }
    const filter = { published: true };
    if (category) filter.category = new RegExp(category, 'i');
    let query = SupportArticle.find(filter).sort({ order: 1, createdAt: 1 });
    const articles = await query.lean();
    let result = articles;
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      result = articles.filter(
        (a) =>
          (a.title && a.title.toLowerCase().includes(term)) ||
          (a.description && a.description.toLowerCase().includes(term)) ||
          (a.category && a.category.toLowerCase().includes(term)) ||
          (a.body && a.body.toLowerCase().includes(term))
      );
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getArticleById(req, res) {
  try {
    const article = await SupportArticle.findOne({ _id: req.params.id, published: true }).lean();
    if (!article) return res.status(404).json({ message: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { list, create, getById, update, addReply, listArticles, getArticleById };
