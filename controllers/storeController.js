const Store = require('../models/Store');
const StoreGroup = require('../models/StoreGroup');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const { getAdapter } = require('../adapters');
const { encrypt, decrypt } = require('../services/encryption');
const { checkAccess, checkStoreLimit } = require('../services/subscriptionAccess');

function toPublicStore(store) {
  const doc = store.toObject ? store.toObject() : store;
  delete doc.credentialsEncrypted;
  return doc;
}

async function list(req, res) {
  try {
    const userId = req.user._id;
    const stores = await Store.find({ userId }).sort({ createdAt: -1 });
    const storeIds = stores.map((s) => s._id);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [revenueByStore, ordersTodayByStore] = await Promise.all([
      Order.aggregate([
        { $match: { userId, storeId: { $in: storeIds } } },
        { $group: { _id: '$storeId', revenue: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { userId, storeId: { $in: storeIds }, date: { $gte: todayStart } } },
        { $group: { _id: '$storeId', count: { $sum: 1 } } },
      ]),
    ]);

    const revenueMap = {};
    revenueByStore.forEach((r) => { revenueMap[r._id.toString()] = r.revenue; });
    const ordersTodayMap = {};
    ordersTodayByStore.forEach((r) => { ordersTodayMap[r._id.toString()] = r.count; });

    const list = stores.map((s) => {
      const out = toPublicStore(s);
      out.revenue = revenueMap[s._id.toString()] ?? 0;
      out.ordersToday = ordersTodayMap[s._id.toString()] ?? 0;
      return out;
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function stats(req, res) {
  try {
    const userId = req.user._id;
    const [storeCount, orderCount, customerCount] = await Promise.all([
      Store.countDocuments({ userId }),
      Order.countDocuments({ userId }),
      Customer.countDocuments({ userId }),
    ]);
    const orders = await Order.find({ userId });
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    res.json({
      totalStores: storeCount,
      activeOrders: orderCount,
      totalCustomers: customerCount,
      totalRevenue: revenue,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getById(req, res) {
  try {
    const store = await Store.findOne({ _id: req.params.id, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    res.json(toPublicStore(store));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const access = await checkAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({ message: access.reason || 'Active subscription required', code: 'SUBSCRIPTION_REQUIRED' });
    }
    const limitCheck = await checkStoreLimit(req.user._id, req.user.plan || 'free_trial');
    if (!limitCheck.allowed) {
      return res.status(403).json({ message: limitCheck.reason || 'Store limit reached', code: 'STORE_LIMIT_REACHED' });
    }
    const { name, url, platform, credentials, status, admin, location } = req.body;
    if (!name || !url) return res.status(400).json({ message: 'Name and URL required' });
    const platformKey = (platform || 'woocommerce').toLowerCase();
    if (!['woocommerce', 'shopify'].includes(platformKey)) {
      return res.status(400).json({ message: 'Platform must be woocommerce or shopify' });
    }
    const adapter = getAdapter(platformKey);
    const creds = credentials || {};
    let credentialsEncrypted = null;
    if (platformKey === 'woocommerce' && (creds.consumerKey || creds.consumerSecret)) {
      const storeConfig = { url, platform: platformKey, credentials: creds };
      const valid = await adapter.validateCredentials(storeConfig);
      if (!valid) return res.status(400).json({ message: 'Invalid store credentials. Check URL and API keys.' });
      credentialsEncrypted = encrypt(JSON.stringify(creds));
    } else if (platformKey === 'shopify' && creds.accessToken) {
      const storeConfig = { url, platform: platformKey, credentials: creds };
      const valid = await adapter.validateCredentials(storeConfig);
      if (!valid) return res.status(400).json({ message: 'Invalid store credentials. Check store URL and access token.' });
      credentialsEncrypted = encrypt(JSON.stringify(creds));
    }
    const normalizedUrl = adapter.normalizeUrl ? adapter.normalizeUrl(url) : url.trim();
    const store = await Store.create({
      name,
      url: normalizedUrl,
      platform: platformKey,
      credentialsEncrypted,
      status: status || 'online',
      admin: admin || '',
      location: location || '',
      userId: req.user._id,
    });
    res.status(201).json(toPublicStore(store));
  } catch (err) {
    if (err.message && err.message.startsWith('Unknown store platform')) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const store = await Store.findOne({ _id: req.params.id, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    const { name, url, status, admin, location, credentials } = req.body;
    if (name != null) store.name = name;
    if (url != null) store.url = url.trim();
    if (status != null) store.status = status;
    if (admin != null) store.admin = admin;
    if (location != null) store.location = location;
    if (credentials && Object.keys(credentials).length > 0) {
      const adapter = getAdapter(store.platform);
      const storeConfig = { url: store.url, platform: store.platform, credentials };
      const valid = await adapter.validateCredentials(storeConfig);
      if (!valid) return res.status(400).json({ message: 'Invalid credentials. Check URL and API keys.' });
      store.credentialsEncrypted = encrypt(JSON.stringify(credentials));
    }
    await store.save();
    res.json(toPublicStore(store));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function remove(req, res) {
  try {
    const store = await Store.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    res.json({ message: 'Store deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

function getDecryptedCredentials(store) {
  if (!store.credentialsEncrypted) return null;
  try {
    return JSON.parse(decrypt(store.credentialsEncrypted));
  } catch {
    return null;
  }
}

async function listGroups(req, res) {
  try {
    const groups = await StoreGroup.find({ userId: req.user._id })
      .populate('storeIds', 'name')
      .sort({ createdAt: -1 });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function createGroup(req, res) {
  try {
    const { name, storeIds } = req.body;
    if (!name) return res.status(400).json({ message: 'Name required' });
    const group = await StoreGroup.create({
      name,
      storeIds: storeIds || [],
      userId: req.user._id,
    });
    res.status(201).json(group);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

const syncService = require('../services/syncService');

async function syncProducts(req, res) {
  try {
    const store = await Store.findOne({ _id: req.params.id, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    const result = await syncService.syncProducts(store._id, req.user._id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Sync failed' });
  }
}

async function syncOrders(req, res) {
  try {
    const store = await Store.findOne({ _id: req.params.id, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    const result = await syncService.syncOrders(store._id, req.user._id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Sync failed' });
  }
}

async function syncCustomers(req, res) {
  try {
    const store = await Store.findOne({ _id: req.params.id, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    const result = await syncService.syncCustomers(store._id, req.user._id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Sync failed' });
  }
}

async function syncAll(req, res) {
  try {
    const store = await Store.findOne({ _id: req.params.id, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    const result = await syncService.syncAll(store._id, req.user._id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Sync failed' });
  }
}

async function syncCoupons(req, res) {
  try {
    const store = await Store.findOne({ _id: req.params.id, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    const result = await syncService.syncCoupons(store._id, req.user._id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Sync failed' });
  }
}

async function syncInventory(req, res) {
  try {
    const store = await Store.findOne({ _id: req.params.id, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    if (store.platform !== 'shopify') {
      return res.status(400).json({ message: 'Inventory sync is only available for Shopify stores' });
    }
    const result = await syncService.syncInventory(store._id, req.user._id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Sync failed' });
  }
}

module.exports = {
  list,
  stats,
  getById,
  create,
  update,
  remove,
  listGroups,
  createGroup,
  toPublicStore,
  getDecryptedCredentials,
  syncProducts,
  syncOrders,
  syncCustomers,
  syncCoupons,
  syncAll,
  syncInventory,
};
