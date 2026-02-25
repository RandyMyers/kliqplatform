/**
 * Seed an admin user so you can log in to the admin app.
 * Same User model as client; admin routes require role === 'admin'.
 *
 * Run from server directory: node scripts/seedAdminUser.js
 * Optional env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME (defaults below).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const MONGO_URL = process.env.MONGO_URL || process.env.MONGODB_URI;
const DEFAULT_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@storehub.com';
const DEFAULT_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
const DEFAULT_NAME = process.env.SEED_ADMIN_NAME || 'Admin User';

if (!MONGO_URL) {
  console.error('Missing MONGO_URL or MONGODB_URI in .env');
  process.exit(1);
}

async function seedAdminUser() {
  await mongoose.connect(MONGO_URL);
  try {
    const existing = await User.findOne({ email: DEFAULT_EMAIL });
    if (existing) {
      if (existing.role === 'admin') {
        console.log('Admin user already exists:', DEFAULT_EMAIL);
        return;
      }
      existing.role = 'admin';
      await existing.save();
      console.log('Updated existing user to admin:', DEFAULT_EMAIL);
      return;
    }
    const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    await User.create({
      fullName: DEFAULT_NAME,
      email: DEFAULT_EMAIL,
      password: hashed,
      role: 'admin',
      plan: 'free_trial',
      isActive: true,
    });
    console.log('Admin user created:', DEFAULT_EMAIL);
    console.log('  Password:', DEFAULT_PASSWORD);
    console.log('  Use these to log in to the admin app.');
  } finally {
    await mongoose.disconnect();
  }
}

seedAdminUser().catch((err) => {
  console.error(err);
  process.exit(1);
});
