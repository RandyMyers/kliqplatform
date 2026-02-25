/**
 * Seed manual products for development/demo.
 * Run from server directory: node scripts/seedProducts.js
 * Requires MONGO_URL in .env. Uses the first user and first store (or creates a store).
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

const seedProducts = [
  {
    externalId: 'seed-1',
    name: 'Classic Cotton T-Shirt',
    sku: 'SHIRT-001',
    price: 24.99,
    salePrice: 19.99,
    stock: 150,
    status: 'in_stock',
    category: 'Apparel',
    productType: 'Clothing',
    vendor: 'StoreHub Demo',
    shortDescription: 'Soft unisex cotton tee.',
    description: 'Comfortable 100% cotton t-shirt. Available in multiple colors. Machine washable.',
    weight: 0.2,
    dimensions: 'S: 28x20 in, M: 30x22 in, L: 32x24 in',
    tags: 'cotton, t-shirt, casual, unisex',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400',
  },
  {
    externalId: 'seed-2',
    name: 'Wireless Bluetooth Earbuds',
    sku: 'AUDIO-002',
    price: 79.99,
    salePrice: null,
    stock: 8,
    status: 'low_stock',
    category: 'Electronics',
    productType: 'Audio',
    vendor: 'TechBrand',
    shortDescription: 'Noise-cancelling wireless earbuds.',
    description: 'High-quality sound with active noise cancellation. 24hr battery life. USB-C charging case.',
    weight: 0.05,
    dimensions: 'Case: 6x3x2 cm',
    tags: 'bluetooth, earbuds, audio, wireless',
    image: 'https://images.unsplash.com/photo-1598331668826-20cecc596b86?w=400',
  },
  {
    externalId: 'seed-3',
    name: 'Stainless Steel Water Bottle',
    sku: 'HOME-003',
    price: 34.99,
    salePrice: 29.99,
    stock: 0,
    status: 'out_of_stock',
    category: 'Home & Kitchen',
    productType: 'Drinkware',
    vendor: 'EcoGear',
    shortDescription: 'Insulated 500ml bottle.',
    description: 'Double-wall vacuum insulation keeps drinks cold 24hrs or hot 12hrs. BPA-free, dishwasher safe.',
    weight: 0.38,
    dimensions: '21 x 7 cm',
    tags: 'water bottle, eco, insulated, stainless',
    image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400',
  },
  {
    externalId: 'seed-4',
    name: 'Organic Face Moisturizer',
    sku: 'BEAUTY-004',
    price: 28.5,
    salePrice: null,
    stock: 45,
    status: 'in_stock',
    category: 'Beauty',
    productType: 'Skincare',
    vendor: 'Natural Glow',
    shortDescription: 'Daily hydrating cream.',
    description: 'Lightweight formula with shea butter and vitamin E. Suitable for all skin types. Paraben-free.',
    weight: 0.12,
    dimensions: '50ml tube',
    tags: 'skincare, organic, moisturizer, beauty',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400',
  },
  {
    externalId: 'seed-5',
    name: 'Yoga Mat Premium',
    sku: 'FIT-005',
    price: 49.99,
    salePrice: 44.99,
    stock: 22,
    status: 'in_stock',
    category: 'Sports',
    productType: 'Fitness',
    vendor: 'ActiveLife',
    shortDescription: 'Non-slip 6mm thick mat.',
    description: 'Eco-friendly TPE material. Extra thick for joint support. Includes carrying strap. 183 x 61 cm.',
    weight: 1.2,
    dimensions: '183 x 61 x 0.6 cm',
    tags: 'yoga, fitness, mat, eco',
    image: 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=400',
  },
  {
    externalId: 'seed-6',
    name: 'Desk LED Lamp',
    sku: 'HOME-006',
    price: 45,
    salePrice: null,
    stock: 30,
    status: 'in_stock',
    category: 'Home Office',
    productType: 'Lighting',
    vendor: 'BrightIdeas',
    shortDescription: 'Adjustable brightness and color temperature.',
    description: 'Touch control. 3 brightness levels. USB port for charging. Modern minimalist design.',
    weight: 0.6,
    dimensions: '35 x 18 x 12 cm',
    tags: 'lamp, led, desk, office',
    image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400',
  },
];

async function run() {
  try {
    await mongoose.connect(MONGO_URL);
    console.log('Connected to MongoDB');

    const user = await User.findOne().sort({ createdAt: 1 });
    if (!user) {
      console.error('No user found. Create a user (sign up) first, then run this script again.');
      process.exit(1);
    }

    let store = await Store.findOne({ userId: user._id });
    if (!store) {
      store = await Store.create({
        name: 'Demo Store',
        url: 'https://demo-store.example.com',
        platform: 'woocommerce',
        status: 'online',
        userId: user._id,
      });
      console.log('Created demo store:', store.name);
    }

    const existing = await Product.countDocuments({ storeId: store._id, userId: user._id });
    if (existing > 0) {
      console.log(`Store "${store.name}" already has ${existing} product(s). Skipping seed. Delete products first to re-seed.`);
    } else {
      const created = await Product.insertMany(
        seedProducts.map((p) => ({
          ...p,
          storeId: store._id,
          userId: user._id,
        }))
      );
      console.log('Seeded', created.length, 'products for store:', store.name);
    }

    console.log('Done.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
