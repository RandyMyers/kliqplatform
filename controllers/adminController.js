const PaymentGatewayConfig = require('../models/PaymentGatewayConfig');
const BankAccount = require('../models/BankAccount');
const Payment = require('../models/Payment');
const BlogPost = require('../models/BlogPost');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Product = require('../models/Product');
const SupportTicket = require('../models/SupportTicket');
const SupportArticle = require('../models/SupportArticle');
const AuditLog = require('../models/AuditLog');
const Setting = require('../models/Setting');
const Plan = require('../models/Plan');
const { encryptPaymentCreds, decryptPaymentCreds } = require('../services/paymentEncryption');
const { logAudit } = require('../services/auditLog');
const { PLANS } = require('../config/plans');

function toSafeGatewayConfig(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o.encryptedCredentials;
  return o;
}

async function getPaymentConfig(req, res) {
  try {
    const configs = await PaymentGatewayConfig.find({}).lean();
    res.json(configs.map(toSafeGatewayConfig));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateStripeConfig(req, res) {
  try {
    const { secretKey, webhookSecret, isLive } = req.body;
    if (!secretKey) return res.status(400).json({ message: 'secretKey required' });
    const credentials = JSON.stringify({
      secretKey,
      webhookSecret: webhookSecret || '',
    });
    const config = await PaymentGatewayConfig.findOneAndUpdate(
      { gateway: 'stripe' },
      {
        encryptedCredentials: encryptPaymentCreds(credentials),
        isLive: !!isLive,
      },
      { upsert: true, new: true }
    );
    res.json(toSafeGatewayConfig(config));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateFlutterwaveConfig(req, res) {
  try {
    const { secretKey, publicKey, webhookHash, isLive } = req.body;
    if (!secretKey) return res.status(400).json({ message: 'secretKey required' });
    const credentials = JSON.stringify({
      secretKey,
      publicKey: publicKey || '',
      webhookHash: webhookHash || '',
    });
    const config = await PaymentGatewayConfig.findOneAndUpdate(
      { gateway: 'flutterwave' },
      {
        encryptedCredentials: encryptPaymentCreds(credentials),
        isLive: !!isLive,
      },
      { upsert: true, new: true }
    );
    res.json(toSafeGatewayConfig(config));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getStripeCredentials(req, res) {
  try {
    const config = await PaymentGatewayConfig.findOne({ gateway: 'stripe' });
    if (!config) return res.status(404).json({ message: 'Stripe not configured' });
    const raw = decryptPaymentCreds(config.encryptedCredentials);
    if (!raw) return res.status(500).json({ message: 'Failed to decrypt' });
    const creds = JSON.parse(raw);
    res.json({ secretKey: creds.secretKey ? '***' + creds.secretKey.slice(-4) : null, webhookSecretSet: !!creds.webhookSecret, isLive: config.isLive });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getFlutterwaveCredentials(req, res) {
  try {
    const config = await PaymentGatewayConfig.findOne({ gateway: 'flutterwave' });
    if (!config) return res.status(404).json({ message: 'Flutterwave not configured' });
    const raw = decryptPaymentCreds(config.encryptedCredentials);
    if (!raw) return res.status(500).json({ message: 'Failed to decrypt' });
    const creds = JSON.parse(raw);
    res.json({ secretKeyMasked: creds.secretKey ? '***' + creds.secretKey.slice(-4) : null, publicKeySet: !!creds.publicKey, isLive: config.isLive });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listBankAccounts(req, res) {
  try {
    const accounts = await BankAccount.find({}).sort({ currency: 1 });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function upsertBankAccount(req, res) {
  try {
    const { currency, accountName, accountNumber, bankName, iban, swiftBic, reference, instructions, active } = req.body;
    if (!currency || !['USD', 'EUR', 'GBP'].includes(currency)) return res.status(400).json({ message: 'currency must be USD, EUR or GBP' });
    if (!accountName || !bankName) return res.status(400).json({ message: 'accountName and bankName required' });
    const account = await BankAccount.findOneAndUpdate(
      { currency },
      {
        accountName,
        accountNumber: accountNumber || '',
        bankName,
        iban: iban || '',
        swiftBic: swiftBic || '',
        reference: reference || '',
        instructions: instructions || '',
        active: active !== false,
      },
      { upsert: true, new: true }
    );
    res.json(account);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listPendingPayments(req, res) {
  try {
    const pending = await Payment.find({ status: 'pending', paymentMethod: 'bank_transfer' })
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(pending);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function verifyBankPayment(req, res) {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (payment.status !== 'pending' || payment.paymentMethod !== 'bank_transfer') {
      return res.status(400).json({ message: 'Only pending bank transfer payments can be verified' });
    }
    payment.status = 'succeeded';
    payment.paidAt = new Date();
    await payment.save();

    const Subscription = require('../models/Subscription');
    const User = require('../models/User');
    let sub = await Subscription.findOne({ userId: payment.userId });
    const plan = payment.metadata?.plan || 'starter';
    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    if (!sub) {
      sub = await Subscription.create({
        userId: payment.userId,
        plan,
        status: 'active',
        currency: payment.currency,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        paymentMethod: 'bank_transfer',
        bankTransferVerifiedAt: new Date(),
      });
    } else {
      sub.status = 'active';
      sub.plan = plan;
      sub.currentPeriodStart = periodStart;
      sub.currentPeriodEnd = periodEnd;
      sub.bankTransferVerifiedAt = new Date();
      await sub.save();
    }
    await User.findByIdAndUpdate(payment.userId, {
      plan,
      subscriptionStatus: 'active',
      trialEndsAt: null,
    });
    res.json({ message: 'Payment verified', subscription: sub, payment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Stats ———
async function getStats(req, res) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalUsers, newUsers7d, newUsers30d, subscriptionsByPlan, pendingPaymentsCount, openTicketsCount, totalPaymentsSum] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo }, role: { $ne: 'admin' } }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo }, role: { $ne: 'admin' } }),
      Subscription.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$plan', count: { $sum: 1 } } }]),
      Payment.countDocuments({ status: 'pending', paymentMethod: 'bank_transfer' }),
      SupportTicket.countDocuments({ status: { $in: ['open', 'in-progress'] } }),
      Payment.aggregate([{ $match: { status: 'succeeded' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

    const plansMap = (subscriptionsByPlan || []).reduce((acc, p) => { acc[p._id] = p.count; return acc; }, {});

    res.json({
      totalUsers: totalUsers || 0,
      newUsers7d: newUsers7d || 0,
      newUsers30d: newUsers30d || 0,
      subscriptionsByPlan: plansMap,
      pendingPaymentsCount: pendingPaymentsCount || 0,
      openTicketsCount: openTicketsCount || 0,
      totalRevenue: (totalPaymentsSum && totalPaymentsSum[0] && totalPaymentsSum[0].total) ? totalPaymentsSum[0].total : 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getAnalyticsTrends(req, res) {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);

    const [signupsAgg, revenueAgg] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: start }, role: { $ne: 'admin' } } },
        { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d' } }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: { status: 'succeeded', createdAt: { $gte: start } } },
        { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d' } }, total: { $sum: '$amount' } } },
      ]),
    ]);

    const signupsByDate = (signupsAgg || []).reduce((acc, x) => { acc[x._id] = x.count; return acc; }, {});
    const revenueByDate = (revenueAgg || []).reduce((acc, x) => { acc[x._id] = x.total; return acc; }, {});

    const signupsByDay = [];
    const revenueByDay = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      signupsByDay.push({ date: dateStr, count: signupsByDate[dateStr] || 0 });
      revenueByDay.push({ date: dateStr, total: revenueByDate[dateStr] || 0 });
    }

    res.json({ signupsByDay, revenueByDay });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Platform oversight (read-only): stores, orders, products ———
async function listStores(req, res) {
  try {
    const { page = 1, limit = 20, userId } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const [stores, total] = await Promise.all([
      Store.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).populate('userId', 'fullName email').lean(),
      Store.countDocuments(filter),
    ]);
    res.json({ stores, total, page: parseInt(page, 10), limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listOrders(req, res) {
  try {
    const { page = 1, limit = 20, userId, storeId, status, from, to } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (storeId) filter.storeId = storeId;
    if (status) filter.status = status;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ date: -1 }).skip(skip).limit(limitNum).populate('storeId', 'name url platform').populate('userId', 'fullName email').lean(),
      Order.countDocuments(filter),
    ]);
    res.json({ orders, total, page: parseInt(page, 10), limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getOrder(req, res) {
  try {
    const order = await Order.findById(req.params.id)
      .populate('storeId', 'name url platform')
      .populate('userId', 'fullName email')
      .populate('customerId', 'email fullName')
      .lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listProducts(req, res) {
  try {
    const { page = 1, limit = 20, search, userId, storeId } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (storeId) filter.storeId = storeId;
    if (search && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { sku: { $regex: search.trim(), $options: 'i' } },
      ];
    }
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).populate('storeId', 'name url').populate('userId', 'fullName email').lean(),
      Product.countDocuments(filter),
    ]);
    res.json({ products, total, page: parseInt(page, 10), limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getProduct(req, res) {
  try {
    const product = await Product.findById(req.params.id)
      .populate('storeId', 'name url platform')
      .populate('userId', 'fullName email')
      .lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateProduct(req, res) {
  try {
    const { reviewStatus } = req.body;
    const updates = {};
    if (reviewStatus !== undefined && ['approved', 'pending_review', 'rejected'].includes(reviewStatus)) updates.reviewStatus = reviewStatus;

    const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('storeId', 'name url platform')
      .populate('userId', 'fullName email')
      .lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    await logAudit(req.user._id, 'product.update', 'product', req.params.id);
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Users (tenant accounts = store owners) ———
async function listUsers(req, res) {
  try {
    const { search, role, plan, isActive, accountStatus, page = 1, limit = 20 } = req.query;
    const filter = { role: { $ne: 'admin' } };
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
      ];
    }
    if (role) filter.role = role;
    if (plan) filter.plan = plan;
    if (isActive !== undefined && isActive !== '') filter.isActive = isActive === 'true' || isActive === true;
    if (accountStatus && ['active', 'under_review', 'suspended'].includes(accountStatus)) filter.accountStatus = accountStatus;

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page: parseInt(page, 10), limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getUser(req, res) {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(404).json({ message: 'User not found' });

    const [storesCount, ordersCount, subscription, openTickets] = await Promise.all([
      Store.countDocuments({ userId: user._id }),
      Order.countDocuments({ userId: user._id }),
      Subscription.findOne({ userId: user._id }).lean(),
      SupportTicket.countDocuments({ userId: user._id, status: { $in: ['open', 'in-progress'] } }),
    ]);

    res.json({
      ...user,
      tenantOverview: { storesCount, ordersCount, subscription, openTickets },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function createUser(req, res) {
  try {
    const { fullName, email, password, role: bodyRole, plan } = req.body;
    if (!fullName || !email) return res.status(400).json({ message: 'fullName and email required' });

    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const role = bodyRole && ['manager', 'user'].includes(bodyRole) ? bodyRole : 'user';
    const planVal = plan && typeof plan === 'string' && plan.trim() ? plan.trim() : 'free_trial';

    const user = await User.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password: password ? require('bcryptjs').hashSync(password, 10) : require('crypto').randomBytes(12).toString('hex'),
      role: role,
      plan: planVal,
    });

    const u = user.toObject();
    delete u.password;
    await logAudit(req.user._id, 'user.create', 'user', u._id?.toString(), { email: u.email });
    res.status(201).json(u);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateUser(req, res) {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target.role === 'admin') return res.status(403).json({ message: 'Cannot update admin user' });

    const { fullName, email, role: bodyRole, plan, trialEndsAt, subscriptionStatus, isActive, accountStatus, accountStatusReason } = req.body;
    const updates = {};
    if (fullName !== undefined) updates.fullName = fullName.trim();
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (bodyRole !== undefined && ['manager', 'user'].includes(bodyRole)) updates.role = bodyRole;
    if (plan !== undefined && typeof plan === 'string' && plan.trim()) updates.plan = plan.trim();
    if (trialEndsAt !== undefined) updates.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
    if (subscriptionStatus !== undefined && ['trialing', 'active', 'past_due', 'cancelled', null].includes(subscriptionStatus)) updates.subscriptionStatus = subscriptionStatus;
    if (isActive !== undefined) updates.isActive = !!isActive;
    if (accountStatus !== undefined && ['active', 'under_review', 'suspended'].includes(accountStatus)) updates.accountStatus = accountStatus;
    if (accountStatusReason !== undefined) updates.accountStatusReason = typeof accountStatusReason === 'string' ? accountStatusReason.trim() : '';

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password').lean();
    await logAudit(req.user._id, 'user.update', 'user', req.params.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Settings (key-value) ———
async function getSettings(req, res) {
  try {
    const docs = await Setting.find({}).lean();
    const settings = {};
    (docs || []).forEach((d) => { settings[d.key] = d.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateSettings(req, res) {
  try {
    const { settings: settingsBody, key, value } = req.body;
    const toSet = settingsBody && typeof settingsBody === 'object'
      ? settingsBody
      : key !== undefined
        ? { [key]: value }
        : {};
    for (const [k, v] of Object.entries(toSet)) {
      if (k && typeof k === 'string') {
        await Setting.findOneAndUpdate(
          { key: k },
          { key: k, value: v },
          { upsert: true, new: true }
        );
      }
    }
    const docs = await Setting.find({}).lean();
    const settings = {};
    (docs || []).forEach((d) => { settings[d.key] = d.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Audit log (read-only) ———
async function listAuditLogs(req, res) {
  try {
    const { page = 1, limit = 50, resource, action: actionFilter } = req.query;
    const filter = {};
    if (resource && resource.trim()) filter.resource = resource.trim();
    if (actionFilter && actionFilter.trim()) filter.action = new RegExp(actionFilter.trim(), 'i');
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(200, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).populate('adminId', 'email fullName').lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ logs, total, page: parseInt(page, 10), limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Support articles (admin CRUD) ———
async function listSupportArticles(req, res) {
  try {
    const { category, published } = req.query;
    const filter = {};
    if (category && category.trim()) filter.category = new RegExp(category.trim(), 'i');
    if (published !== undefined && published !== '') filter.published = published === 'true' || published === true;
    const articles = await SupportArticle.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    res.json(articles);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getSupportArticle(req, res) {
  try {
    const article = await SupportArticle.findById(req.params.id).lean();
    if (!article) return res.status(404).json({ message: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function createSupportArticle(req, res) {
  try {
    const { title, description, body, category, order, published } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ message: 'title required' });
    const article = await SupportArticle.create({
      title: title.trim(),
      description: (description || '').trim(),
      body: (body || '').trim(),
      category: (category || 'General').trim(),
      order: order != null ? Number(order) : 0,
      published: published !== false && published !== 'false',
    });
    await logAudit(req.user._id, 'support_article.create', 'support_article', article._id?.toString(), { title: article.title });
    res.status(201).json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateSupportArticle(req, res) {
  try {
    const article = await SupportArticle.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article not found' });
    const { title, description, body, category, order, published } = req.body;
    if (title !== undefined) article.title = title.trim();
    if (description !== undefined) article.description = (description || '').trim();
    if (body !== undefined) article.body = (body || '').trim();
    if (category !== undefined) article.category = (category || 'General').trim();
    if (order !== undefined) article.order = Number(order);
    if (published !== undefined) article.published = published !== false && published !== 'false';
    await article.save();
    await logAudit(req.user._id, 'support_article.update', 'support_article', req.params.id);
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function deleteSupportArticle(req, res) {
  try {
    const article = await SupportArticle.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article not found' });
    await logAudit(req.user._id, 'support_article.delete', 'support_article', req.params.id);
    res.json({ message: 'Article deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Blog (admin CRUD) ———
async function listBlogPosts(req, res) {
  try {
    const posts = await BlogPost.find({}).sort({ order: 1, publishedAt: -1, createdAt: -1 }).lean();
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function createBlogPost(req, res) {
  try {
    const { title, slug, excerpt, body, author, published, order, titleTranslations, bodyTranslations, excerptTranslations, metaTitleTranslations, metaDescriptionTranslations } = req.body;
    if (!title) return res.status(400).json({ message: 'title required' });
    const post = await BlogPost.create({
      title,
      slug: slug || undefined,
      excerpt: excerpt || '',
      body: body || '',
      author: author || 'StoreHub',
      published: !!published,
      order: order != null ? Number(order) : 0,
      ...(titleTranslations && typeof titleTranslations === 'object' && { titleTranslations }),
      ...(bodyTranslations && typeof bodyTranslations === 'object' && { bodyTranslations }),
      ...(excerptTranslations && typeof excerptTranslations === 'object' && { excerptTranslations }),
      ...(metaTitleTranslations && typeof metaTitleTranslations === 'object' && { metaTitleTranslations }),
      ...(metaDescriptionTranslations && typeof metaDescriptionTranslations === 'object' && { metaDescriptionTranslations }),
    });
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getBlogPost(req, res) {
  try {
    const post = await BlogPost.findById(req.params.id).lean();
    if (!post) return res.status(404).json({ message: 'Blog post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateBlogPost(req, res) {
  try {
    const { title, slug, excerpt, body, author, published, order, titleTranslations, bodyTranslations, excerptTranslations, metaTitleTranslations, metaDescriptionTranslations } = req.body;
    const update = {
      ...(title !== undefined && { title }),
      ...(slug !== undefined && { slug }),
      ...(excerpt !== undefined && { excerpt }),
      ...(body !== undefined && { body }),
      ...(author !== undefined && { author }),
      ...(published !== undefined && { published: !!published }),
      ...(order !== undefined && { order: Number(order) }),
      ...(titleTranslations !== undefined && typeof titleTranslations === 'object' && { titleTranslations }),
      ...(bodyTranslations !== undefined && typeof bodyTranslations === 'object' && { bodyTranslations }),
      ...(excerptTranslations !== undefined && typeof excerptTranslations === 'object' && { excerptTranslations }),
      ...(metaTitleTranslations !== undefined && typeof metaTitleTranslations === 'object' && { metaTitleTranslations }),
      ...(metaDescriptionTranslations !== undefined && typeof metaDescriptionTranslations === 'object' && { metaDescriptionTranslations }),
    };
    const post = await BlogPost.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    if (!post) return res.status(404).json({ message: 'Blog post not found' });
    if (published && !post.publishedAt) {
      post.publishedAt = new Date();
      await post.save();
    }
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function deleteBlogPost(req, res) {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ message: 'Blog post not found' });
    await logAudit(req.user._id, 'blog.delete', 'blog', req.params.id);
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Plans ———
async function listPlans(req, res) {
  try {
    let plans = await Plan.find({}).sort({ order: 1, slug: 1 }).lean();
    if (plans.length === 0 && PLANS && PLANS.length > 0) {
      try {
        await seedPlansFromConfig();
        plans = await Plan.find({}).sort({ order: 1, slug: 1 }).lean();
      } catch (seedErr) {
        console.error('seedPlansFromConfig error:', seedErr);
        return res.status(500).json({ message: seedErr.message || 'Failed to seed plans' });
      }
    }
    res.json((plans || []).map(toPlanResponse).filter(Boolean));
  } catch (err) {
    console.error('listPlans error:', err);
    res.status(500).json({ message: err.message });
  }
}

function toPlanResponse(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.id = o.slug || (o._id != null && typeof o._id.toString === 'function' ? o._id.toString() : String(o._id));
  return o;
}

async function seedPlansFromConfig() {
  const list = Array.isArray(PLANS) ? PLANS : [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const slug = p.slug || p.id || `plan-${i}`;
    const prices = p.prices && typeof p.prices === 'object' ? p.prices : {};
    const interval = p.interval === 'year' ? 'year' : 'month';
    await Plan.findOneAndUpdate(
      { slug },
      {
        slug,
        name: p.name || slug,
        description: p.description || '',
        limits: p.limits && typeof p.limits === 'object' ? p.limits : {},
        features: Array.isArray(p.features) ? p.features : [],
        prices,
        interval,
        order: i,
        active: true,
      },
      { upsert: true, new: true }
    );
  }
}

async function getPlan(req, res) {
  try {
    const plan = await Plan.findById(req.params.id).lean();
    let target = plan;
    if (!target) {
      const bySlug = await Plan.findOne({ slug: req.params.id }).lean();
      if (!bySlug) return res.status(404).json({ message: 'Plan not found' });
      target = bySlug;
    }
    const slug = target.slug || target._id?.toString();
    const activeSubscriptionsCount = await Subscription.countDocuments({
      plan: slug,
      status: { $in: ['active', 'trialing'] },
    });
    const out = toPlanResponse(target);
    out.activeSubscriptionsCount = activeSubscriptionsCount;
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function createPlan(req, res) {
  try {
    const { slug, name, description, limits, features, prices, interval, order } = req.body;
    if (!slug || !name) return res.status(400).json({ message: 'slug and name required' });
    const existing = await Plan.findOne({ slug: slug.trim() });
    if (existing) return res.status(400).json({ message: 'Plan with this slug already exists' });
    const plan = await Plan.create({
      slug: slug.trim(),
      name: name.trim(),
      description: description || '',
      limits: limits || {},
      features: Array.isArray(features) ? features : [],
      prices: prices || {},
      interval: interval || 'month',
      order: order != null ? Number(order) : 0,
    });
    res.status(201).json(toPlanResponse(plan));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updatePlan(req, res) {
  try {
    const plan = await Plan.findById(req.params.id);
    const bySlug = !plan ? await Plan.findOne({ slug: req.params.id }) : null;
    const target = plan || bySlug;
    if (!target) return res.status(404).json({ message: 'Plan not found' });

    const { name, description, limits, features, prices, interval, order, active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    if (limits !== undefined) updates.limits = limits;
    if (features !== undefined) updates.features = Array.isArray(features) ? features : [];
    if (prices !== undefined) updates.prices = prices;
    if (interval !== undefined) updates.interval = interval;
    if (order !== undefined) updates.order = Number(order);
    if (active !== undefined) updates.active = !!active;

    const updated = await Plan.findByIdAndUpdate(target._id, updates, { new: true }).lean();
    res.json(toPlanResponse(updated));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function deletePlan(req, res) {
  try {
    const plan = await Plan.findById(req.params.id);
    const bySlug = !plan ? await Plan.findOne({ slug: req.params.id }) : null;
    const target = plan || bySlug;
    if (!target) return res.status(404).json({ message: 'Plan not found' });
    await Plan.findByIdAndUpdate(target._id, { active: false });
    await logAudit(req.user._id, 'plan.deactivate', 'plan', target._id?.toString());
    res.json({ message: 'Plan deactivated', id: target._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Subscriptions ———
async function listSubscriptions(req, res) {
  try {
    const { plan, status, userId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (plan) filter.plan = plan;
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [subs, total] = await Promise.all([
      Subscription.find(filter).populate('userId', 'fullName email plan').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Subscription.countDocuments(filter),
    ]);

    res.json({ subscriptions: subs, total, page: parseInt(page, 10), limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getSubscription(req, res) {
  try {
    const sub = await Subscription.findById(req.params.id).populate('userId', 'fullName email plan trialEndsAt').lean();
    if (!sub) return res.status(404).json({ message: 'Subscription not found' });
    res.json(sub);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateSubscription(req, res) {
  try {
    const { plan, status, currentPeriodEnd, cancelAtPeriodEnd } = req.body;
    const updates = {};
    if (plan !== undefined) updates.plan = plan;
    if (status !== undefined && ['trialing', 'active', 'past_due', 'cancelled', 'expired'].includes(status)) updates.status = status;
    if (currentPeriodEnd !== undefined) updates.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
    if (cancelAtPeriodEnd !== undefined) updates.cancelAtPeriodEnd = !!cancelAtPeriodEnd;

    const sub = await Subscription.findByIdAndUpdate(req.params.id, updates, { new: true }).populate('userId', 'fullName email').lean();
    if (!sub) return res.status(404).json({ message: 'Subscription not found' });

    const userId = sub.userId?._id || sub.userId;
    if (plan !== undefined && userId) {
      await User.findByIdAndUpdate(userId, { plan, subscriptionStatus: status || sub.status });
    }
    res.json(sub);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function cancelSubscription(req, res) {
  try {
    const { immediate } = req.body;
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: 'Subscription not found' });

    if (immediate) {
      sub.status = 'cancelled';
      sub.cancelAtPeriodEnd = false;
      await sub.save();
      await User.findByIdAndUpdate(sub.userId, { subscriptionStatus: 'cancelled', plan: 'free_trial' });
    } else {
      sub.cancelAtPeriodEnd = true;
      await sub.save();
    }
    await logAudit(req.user._id, 'subscription.cancel', 'subscription', req.params.id, { immediate: !!req.body.immediate });
    res.json(sub);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function extendTrial(req, res) {
  try {
    const { days = 14 } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Cannot extend trial for admin' });

    const now = new Date();
    const newEnd = new Date(now.getTime() + Math.max(1, parseInt(days, 10)) * 24 * 60 * 60 * 1000);
    await User.findByIdAndUpdate(req.params.id, { trialEndsAt: newEnd, subscriptionStatus: 'trialing' });
    const updated = await User.findById(req.params.id).select('-password').lean();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Payments (full list, refund, export) ———
async function listPayments(req, res) {
  try {
    const { status, userId, paymentMethod, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [payments, total] = await Promise.all([
      Payment.find(filter).populate('userId', 'fullName email').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Payment.countDocuments(filter),
    ]);

    res.json({ payments, total, page: parseInt(page, 10), limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getPayment(req, res) {
  try {
    const payment = await Payment.findById(req.params.id).populate('userId', 'fullName email').populate('subscriptionId').lean();
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function refundPayment(req, res) {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (payment.status !== 'succeeded') return res.status(400).json({ message: 'Only succeeded payments can be refunded' });

    payment.status = 'refunded';
    await payment.save();
    await logAudit(req.user._id, 'payment.refund', 'payment', req.params.id);
    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function exportPayments(req, res) {
  try {
    const { status, userId, paymentMethod, dateFrom, dateTo } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const payments = await Payment.find(filter).populate('userId', 'fullName email').sort({ createdAt: -1 }).limit(5000).lean();

    const headers = ['Date', 'User', 'Email', 'Amount', 'Currency', 'Status', 'Method'];
    const rows = payments.map((p) => [
      p.createdAt ? new Date(p.createdAt).toISOString() : '',
      (p.userId && p.userId.fullName) || '',
      (p.userId && p.userId.email) || '',
      (p.amount / 100).toFixed(2),
      p.currency || '',
      p.status || '',
      p.paymentMethod || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=payments-export.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ——— Support tickets ———
async function listTickets(req, res) {
  try {
    const { status, userId, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter).populate('userId', 'fullName email').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      SupportTicket.countDocuments(filter),
    ]);

    res.json({ tickets, total, page: parseInt(page, 10), limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getTicket(req, res) {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('userId', 'fullName email')
      .lean();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateTicket(req, res) {
  try {
    const { status, priority } = req.body;
    const updates = {};
    if (status !== undefined && ['open', 'in-progress', 'resolved', 'closed'].includes(status)) updates.status = status;
    if (priority !== undefined && ['low', 'medium', 'high'].includes(priority)) updates.priority = priority;

    const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('userId', 'fullName email')
      .lean();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function addTicketReply(req, res) {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ message: 'message required' });

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    ticket.replies = ticket.replies || [];
    ticket.replies.push({
      message: message.trim(),
      userId: req.user._id,
      isStaff: true,
    });
    ticket.status = ticket.status === 'open' ? 'in-progress' : ticket.status;
    await ticket.save();

    const updated = await SupportTicket.findById(ticket._id).populate('userId', 'fullName email').lean();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  getPaymentConfig,
  updateStripeConfig,
  updateFlutterwaveConfig,
  getStripeCredentials,
  getFlutterwaveCredentials,
  listBankAccounts,
  upsertBankAccount,
  listPendingPayments,
  verifyBankPayment,
  getStats,
  getAnalyticsTrends,
  listUsers,
  getUser,
  createUser,
  updateUser,
  listBlogPosts,
  createBlogPost,
  getBlogPost,
  updateBlogPost,
  deleteBlogPost,
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  listSubscriptions,
  getSubscription,
  updateSubscription,
  cancelSubscription,
  extendTrial,
  listPayments,
  getPayment,
  refundPayment,
  exportPayments,
  getSettings,
  updateSettings,
  listAuditLogs,
  listSupportArticles,
  getSupportArticle,
  createSupportArticle,
  updateSupportArticle,
  deleteSupportArticle,
  listTickets,
  getTicket,
  updateTicket,
  addTicketReply,
  listStores,
  listOrders,
  getOrder,
  listProducts,
  getProduct,
  updateProduct,
};
