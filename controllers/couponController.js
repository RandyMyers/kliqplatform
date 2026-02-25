const Coupon = require('../models/Coupon');
const Store = require('../models/Store');

async function list(req, res) {
  try {
    const { storeId } = req.query;
    const filter = { userId: req.user._id };
    if (storeId) filter.storeId = storeId;
    const coupons = await Coupon.find(filter)
      .populate('storeId', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const { code, discountType, discountValue, description, validFrom, validTo, usageLimit, storeId } = req.body;
    if (!code || !discountType || discountValue == null) {
      return res.status(400).json({ message: 'Code, discountType and discountValue required' });
    }
    if (!['percent', 'fixed'].includes(discountType)) {
      return res.status(400).json({ message: 'discountType must be percent or fixed' });
    }
    if (storeId) {
      const store = await Store.findOne({ _id: storeId, userId: req.user._id });
      if (!store) return res.status(400).json({ message: 'Store not found' });
    }
    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      discountType,
      discountValue: Number(discountValue),
      description: description ? String(description).trim() : undefined,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validTo: validTo ? new Date(validTo) : undefined,
      usageLimit: usageLimit != null ? Number(usageLimit) : undefined,
      storeId: storeId || undefined,
      userId: req.user._id,
    });
    res.status(201).json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getById(req, res) {
  try {
    const coupon = await Coupon.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).populate('storeId', 'name');
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function update(req, res) {
  try {
    const { code, discountType, discountValue, description, validFrom, validTo, usageLimit, storeId } = req.body;
    const update = {};
    if (code !== undefined) update.code = code.trim().toUpperCase();
    if (discountType !== undefined) update.discountType = discountType;
    if (discountValue !== undefined) update.discountValue = Number(discountValue);
    if (description !== undefined) update.description = description ? String(description).trim() : null;
    if (validFrom !== undefined) update.validFrom = validFrom ? new Date(validFrom) : null;
    if (validTo !== undefined) update.validTo = validTo ? new Date(validTo) : null;
    if (usageLimit !== undefined) update.usageLimit = usageLimit != null ? Number(usageLimit) : null;
    if (storeId !== undefined) {
      if (storeId) {
        const store = await Store.findOne({ _id: storeId, userId: req.user._id });
        if (!store) return res.status(400).json({ message: 'Store not found' });
        update.storeId = storeId;
      } else {
        update.storeId = null;
      }
    }
    const coupon = await Coupon.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      update,
      { new: true }
    ).populate('storeId', 'name');
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function remove(req, res) {
  try {
    const coupon = await Coupon.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { list, create, getById, update, remove };
