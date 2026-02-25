const Product = require('../models/Product');
const Store = require('../models/Store');
const Order = require('../models/Order');

async function list(req, res) {
  try {
    const { storeId, search, status } = req.query;
    const filter = { userId: req.user._id };
    if (storeId) filter.storeId = storeId;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { sku: new RegExp(search, 'i') },
      ];
    }
    const products = await Product.find(filter)
      .populate('storeId', 'name')
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function stats(req, res) {
  try {
    const userId = req.user._id;
    const [
      total,
      lowStock,
      outOfStock,
      inStock,
      categories,
      storeCount,
      inventoryAgg,
      onSaleCount,
      productsByStoreAgg,
      lowStockProducts,
      recentlyAdded,
    ] = await Promise.all([
      Product.countDocuments({ userId }),
      Product.countDocuments({ userId, status: 'low_stock' }),
      Product.countDocuments({ userId, status: 'out_of_stock' }),
      Product.countDocuments({ userId, status: 'in_stock' }),
      Product.distinct('category', { userId }),
      Store.countDocuments({ userId }),
      Product.aggregate([
        { $match: { userId } },
        { $project: { value: { $multiply: ['$price', { $max: [0, { $ifNull: ['$stock', 0] }] } ] } } },
        { $group: { _id: null, total: { $sum: '$value' } } },
      ]),
      Product.countDocuments({ userId, salePrice: { $exists: true, $ne: null, $gt: 0 } }),
      Product.aggregate([
        { $match: { userId } },
        { $group: { _id: '$storeId', count: { $sum: 1 } } },
        { $lookup: { from: 'stores', localField: '_id', foreignField: '_id', as: 'store' } },
        { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
        { $project: { name: '$store.name', products: '$count' } },
        { $sort: { products: -1 } },
      ]),
      Product.find({ userId, status: 'low_stock' })
        .populate('storeId', 'name')
        .sort({ stock: 1 })
        .limit(10)
        .lean(),
      Product.find({ userId })
        .populate('storeId', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .select('name sku createdAt storeId')
        .lean(),
    ]);
    const inventoryValue = inventoryAgg[0]?.total ?? 0;

    // Top products by quantity sold (from orders with lineItems.productId)
    let topProductsByQuantity = [];
    try {
      const topAgg = await Order.aggregate([
        { $match: { userId, status: { $ne: 'cancelled' }, 'lineItems.productId': { $exists: true, $ne: null, $ne: '' } } },
        { $unwind: '$lineItems' },
        { $match: { 'lineItems.productId': { $exists: true, $ne: null, $ne: '' } } },
        {
          $group: {
            _id: { storeId: '$storeId', productId: '$lineItems.productId' },
            quantity: { $sum: '$lineItems.quantity' },
            revenue: { $sum: { $multiply: [{ $ifNull: ['$lineItems.quantity', 0] }, { $ifNull: ['$lineItems.price', 0] }] } },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 10 },
      ]);
      if (topAgg.length > 0) {
        const pairs = topAgg.map((t) => ({ storeId: t._id.storeId, externalId: t._id.productId }));
        const products = await Product.find({ userId, $or: pairs }).select('name externalId storeId _id').lean();
        const byKey = {};
        products.forEach((p) => { byKey[`${p.storeId}_${p.externalId}`] = { name: p.name, _id: p._id }; });
        topProductsByQuantity = topAgg.map((t) => {
          const info = byKey[`${t._id.storeId}_${t._id.productId}`];
          return {
            _id: info?._id,
            productId: t._id.productId,
            storeId: t._id.storeId,
            name: info?.name || `Product ${t._id.productId}`,
            quantity: t.quantity,
            revenue: Math.round(t.revenue * 100) / 100,
          };
        });
      }
    } catch (_) {
      // ignore aggregation errors (e.g. no orders or schema mismatch)
    }

    res.json({
      totalProducts: total,
      lowStockItems: lowStock,
      outOfStockItems: outOfStock,
      inStockCount: inStock,
      categories: categories.filter(Boolean).length,
      activeStores: storeCount,
      inventoryValue: Math.round(inventoryValue * 100) / 100,
      onSaleCount: onSaleCount || 0,
      productsByStore: (productsByStoreAgg || []).map((r) => ({ name: r.name || 'Unnamed store', products: r.products })),
      lowStockProducts: lowStockProducts || [],
      recentlyAdded: recentlyAdded || [],
      topProductsByQuantity: topProductsByQuantity || [],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getById(req, res) {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('storeId', 'name url');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const { name, sku, price, salePrice, stock, status, storeId, category, productType, vendor, image, description, shortDescription, weight, dimensions, tags } = req.body;
    if (!name || !price || !storeId) return res.status(400).json({ message: 'Name, price and storeId required' });
    const store = await Store.findOne({ _id: storeId, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    const product = await Product.create({
      name,
      sku: sku || '',
      price,
      salePrice: salePrice != null ? salePrice : undefined,
      stock: stock ?? 0,
      status: status || 'in_stock',
      storeId,
      category: category || '',
      productType: productType || '',
      vendor: vendor || '',
      image: image || '',
      description: description || '',
      shortDescription: shortDescription || '',
      weight: weight != null ? weight : undefined,
      dimensions: dimensions || '',
      tags: tags || '',
      userId: req.user._id,
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function remove(req, res) {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { list, stats, getById, create, update, remove };
