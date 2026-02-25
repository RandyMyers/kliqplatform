/** Static extension catalog for Extensions.js client page. */
const CATALOG = [
  { id: 'woocommerce', name: 'WooCommerce', description: 'Connect your WooCommerce store. Sync products, orders, and customers.', installed: true, category: 'Stores' },
  { id: 'shopify', name: 'Shopify', description: 'Connect your Shopify store. Sync products, orders, customers, and inventory.', installed: true, category: 'Stores' },
  { id: 'mailchimp', name: 'Mailchimp', description: 'Sync customers and send email campaigns.', installed: false, category: 'Marketing' },
  { id: 'stripe', name: 'Stripe', description: 'Accept payments and manage subscriptions.', installed: false, category: 'Payments' },
  { id: 'quickbooks', name: 'QuickBooks', description: 'Export orders and revenue for accounting.', installed: false, category: 'Accounting' },
  { id: 'slack', name: 'Slack', description: 'Get order and support notifications in Slack.', installed: false, category: 'Notifications' },
  { id: 'google-analytics', name: 'Google Analytics', description: 'Track store traffic and conversions.', installed: false, category: 'Analytics' },
];

async function list(req, res) {
  try {
    res.json(CATALOG);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { list };
