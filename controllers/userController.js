const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function list(req, res) {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function stats(req, res) {
  try {
    const [total, byRole, activePlans] = await Promise.all([
      User.countDocuments(),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      User.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
    ]);
    const roles = Object.fromEntries((byRole || []).map((r) => [r._id || 'unknown', r.count]));
    const plans = Object.fromEntries((activePlans || []).map((p) => [p._id || 'unknown', p.count]));
    res.json({
      totalUsers: total,
      activeUsers: total,
      totalRoles: Object.keys(roles).length,
      activeSessions: 0,
      byRole: roles,
      byPlan: plans,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function getById(req, res) {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function create(req, res) {
  try {
    const { fullName, email, password, role } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email and password required' });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullName,
      email,
      password: hashed,
      role: role || 'user',
    });
    const userObj = user.toObject();
    delete userObj.password;
    res.status(201).json(userObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

const PROFILE_AND_ADMIN_FIELDS = [
  'fullName', 'email', 'role', 'avatar', 'phone', 'jobTitle', 'timezone', 'language',
  'businessName', 'companyWebsite', 'industry', 'companySize', 'currency',
  'addressStreet', 'addressCity', 'addressState', 'addressCountry', 'addressPostalCode',
];

async function update(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    for (const key of PROFILE_AND_ADMIN_FIELDS) {
      if (req.body[key] !== undefined) user[key] = req.body[key] === '' ? undefined : req.body[key];
    }
    if (req.body.password) user.password = await bcrypt.hash(req.body.password, 10);
    await user.save();
    const userObj = user.toObject();
    delete userObj.password;
    res.json(userObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function remove(req, res) {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { list, stats, getById, create, update, remove };
