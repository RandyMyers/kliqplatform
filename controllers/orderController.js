const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Store = require('../models/Store');

async function list(req, res) {
  try {
    const { storeId, status, search } = req.query;
    const filter = { userId: req.user._id };
    if (storeId) filter.storeId = storeId;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { orderId: new RegExp(search, 'i') },
      ];
    }
    const orders = await Order.find(filter)
      .populate('storeId', 'name')
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function stats(req, res) {
  try {
    const userId = req.user._id;
    const { storeId, period } = req.query;
    const baseMatch = { userId };
    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) baseMatch.storeId = new mongoose.Types.ObjectId(storeId);
    let dateFilter = {};
    if (period === '7d' || period === '30d' || period === '90d') {
      const days = parseInt(period.replace(/\D/g, ''), 10) || 30;
      const from = new Date();
      from.setDate(from.getDate() - days);
      from.setHours(0, 0, 0, 0);
      dateFilter = { date: { $gte: from } };
    }
    const matchWithDate = { ...baseMatch, ...dateFilter };
    const [total, pending, completed, stores, ordersByDateAgg, recentOrders] = await Promise.all([
      Order.countDocuments(baseMatch),
      Order.countDocuments({ ...baseMatch, status: 'pending' }),
      Order.countDocuments({ ...baseMatch, status: 'completed' }),
      Store.countDocuments({ userId }),
      Order.aggregate([
        { $match: { ...matchWithDate, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, count: { $sum: 1 }, total: { $sum: '$total' } } },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', orders: '$count', value: { $round: ['$total', 2] } } },
      ]),
      Order.find(baseMatch).populate('storeId', 'name').populate('customerId', 'name email').sort({ date: -1 }).limit(10).lean(),
    ]);
    const orders = await Order.find(matchWithDate);
    const revenue = orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total || 0), 0);
    res.json({
      totalOrders: total,
      pendingOrders: pending,
      completedOrders: completed,
      revenue,
      activeStores: stores,
      ordersByDate: ordersByDateAgg || [],
      recentOrders: recentOrders || [],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getById(req, res) {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('storeId', 'name url')
      .populate('customerId', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function updateStatus(req, res) {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'Status required' });
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { list, stats, getById, updateStatus };
