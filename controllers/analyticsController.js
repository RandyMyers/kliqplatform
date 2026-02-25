const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Store = require('../models/Store');

async function overview(req, res) {
  try {
    const userId = req.user._id;
    const { period = '30d', storeId } = req.query;
    const baseMatch = { userId };
    if (storeId) baseMatch.storeId = storeId;
    let dateStart = null;
    if (period === '7d' || period === '30d' || period === '90d') {
      const days = parseInt(period.replace(/\D/g, ''), 10) || 30;
      dateStart = new Date();
      dateStart.setDate(dateStart.getDate() - days);
      dateStart.setHours(0, 0, 0, 0);
    }
    const dateMatch = dateStart ? { date: { $gte: dateStart } } : {};
    const matchWithDate = { ...baseMatch, ...dateMatch };
    const orders = await Order.find(matchWithDate).lean();
    const orderCount = orders.length;
    const validOrders = orders.filter((o) => o.status !== 'cancelled');
    const totalRevenue = validOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalRefunds = orders.reduce((sum, o) => {
      const r = (o.refunds || []).reduce((s, r) => s + (r.amount || 0), 0);
      return sum + r;
    }, 0);
    const totalDiscount = validOrders.reduce((sum, o) => sum + (o.discountTotal || 0), 0);
    const netRevenue = totalRevenue - totalRefunds;
    const custDateFilter = dateStart ? { createdAt: { $gte: dateStart } } : {};
    const [productCount, customerCount, storeCount, newCustomers] = await Promise.all([
      Product.countDocuments(storeId ? { userId, storeId } : { userId }),
      Customer.countDocuments(storeId ? { userId, storeId } : { userId }),
      Store.countDocuments({ userId }),
      Customer.countDocuments({ ...(storeId ? { userId, storeId } : { userId }), ...custDateFilter }),
    ]);
    const aov = orderCount > 0 ? totalRevenue / orderCount : 0;
    res.json({
      totalOrders: orderCount,
      totalProducts: productCount,
      totalCustomers: customerCount,
      totalStores: storeCount,
      totalRevenue,
      completedRevenue: validOrders.filter((o) => o.status === 'completed').reduce((sum, o) => sum + (o.total || 0), 0),
      netRevenue,
      totalRefunds,
      totalDiscount,
      averageOrderValue: Math.round(aov * 100) / 100,
      newCustomersInPeriod: newCustomers,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function sales(req, res) {
  try {
    const userId = req.user._id;
    const { days = 30, storeId } = req.query;
    const start = new Date();
    start.setDate(start.getDate() - Number(days));
    start.setHours(0, 0, 0, 0);
    const match = { userId, date: { $gte: start }, status: { $ne: 'cancelled' } };
    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) match.storeId = new mongoose.Types.ObjectId(storeId);
    const result = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json(result.map((r) => ({ date: r._id, total: r.total, count: r.count })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function ordersChart(req, res) {
  try {
    const userId = req.user._id;
    const { days = 30, storeId } = req.query;
    const start = new Date();
    start.setDate(start.getDate() - Number(days));
    start.setHours(0, 0, 0, 0);
    const match = { userId, date: { $gte: start } };
    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) match.storeId = new mongoose.Types.ObjectId(storeId);
    const result = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json(
      result.map((r) => ({
        date: r._id,
        total: r.total,
        completed: r.completed,
        cancelled: r.cancelled,
      }))
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function revenueByStore(req, res) {
  try {
    const userId = req.user._id;
    const { period = '30d' } = req.query;
    const start = new Date();
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    const result = await Order.aggregate([
      { $match: { userId, date: { $gte: start }, status: { $ne: 'cancelled' } } },
      { $group: { _id: '$storeId', revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 'store' } },
      { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
      { $project: { storeId: '$_id', storeName: '$store.name', revenue: 1, orders: 1 } },
    ]);
    res.json(result.map((r) => ({ storeId: r.storeId, storeName: r.storeName || 'Unknown', revenue: r.revenue, orders: r.orders })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { overview, sales, ordersChart, revenueByStore };
