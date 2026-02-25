/**
 * Delete all products for the first user's first store (so seed can run).
 * Run from server directory: node scripts/deleteStoreProducts.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');

const MONGO_URL = process.env.MONGO_URL || process.env.MONGODB_URI;
if (!MONGO_URL) {
  console.error('Missing MONGO_URL or MONGODB_URI in .env');
  process.exit(1);
}

async function run() {
  try {
    await mongoose.connect(MONGO_URL);
    console.log('Connected to MongoDB');

    const user = await User.findOne().sort({ createdAt: 1 });
    if (!user) {
      console.error('No user found.');
      process.exit(1);
    }

    const store = await Store.findOne({ userId: user._id });
    if (!store) {
      console.log('No store found for user. Nothing to delete.');
      process.exit(0);
    }

    const result = await Product.deleteMany({ storeId: store._id, userId: user._id });
    console.log('Deleted', result.deletedCount, 'product(s) from store:', store.name);
    console.log('Done. You can run npm run seed:products now.');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
