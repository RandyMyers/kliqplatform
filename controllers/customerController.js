const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Store = require('../models/Store');

async function list(req, res) {
  try {
    const { storeId, search, status } = req.query;
    const filter = { userId: req.user._id };
    if (storeId) filter.storeId = storeId;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
      ];
    }
    const customers = await Customer.find(filter)
      .populate('storeId', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function stats(req, res) {
  try {
    const userId = req.user._id;
    const { storeId } = req.query;
    const baseFilter = { userId };
    if (storeId) baseFilter.storeId = storeId;
    const [total, active, stores, topBySpent, recentlyAdded] = await Promise.all([
      Customer.countDocuments(baseFilter),
      Customer.countDocuments({ ...baseFilter, status: 'active' }),
      Store.countDocuments({ userId }),
      Customer.find(baseFilter).sort({ totalSpent: -1 }).limit(10).populate('storeId', 'name').lean(),
      Customer.find(baseFilter).sort({ createdAt: -1 }).limit(10).populate('storeId', 'name').select('name email totalSpent storeId createdAt').lean(),
    ]);
    const customers = await Customer.find(baseFilter);
    const avgOrderValue = customers.length
      ? customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0) / customers.length
      : 0;
    const locations = new Set(customers.map((c) => c.location).filter(Boolean)).size;
    res.json({
      totalCustomers: total,
      activeCustomers: active,
      averageOrderValue: Math.round(avgOrderValue * 100) / 100,
      customerLocations: locations,
      topCustomersBySpent: topBySpent || [],
      recentlyAdded: recentlyAdded || [],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getById(req, res) {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('storeId', 'name url');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getOrderHistory(req, res) {
  try {
    const orders = await Order.find({
      customerId: req.params.id,
      userId: req.user._id,
    })
      .populate('storeId', 'name')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { list, stats, getById, getOrderHistory };
