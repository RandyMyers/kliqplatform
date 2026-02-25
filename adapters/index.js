const wooCommerceAdapter = require('./wooCommerce');
const shopifyAdapter = require('./shopify');

const ADAPTERS = {
  woocommerce: wooCommerceAdapter,
  shopify: shopifyAdapter,
};

function getAdapter(platform) {
  const key = (platform || '').toLowerCase();
  const adapter = ADAPTERS[key];
  if (!adapter) throw new Error(`Unknown store platform: ${platform}. Supported: woocommerce, shopify`);
  return adapter;
}

function getSupportedPlatforms() {
  return Object.keys(ADAPTERS);
}

module.exports = { getAdapter, getSupportedPlatforms };
