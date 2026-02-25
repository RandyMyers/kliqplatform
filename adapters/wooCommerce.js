const axios = require('axios');
const https = require('https');

const WOOCOMMERCE_BYPASS_SSL = process.env.WOOCOMMERCE_BYPASS_SSL === 'true';

function normalizeUrl(url) {
  let u = url.trim();
  if (!u.startsWith('http')) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}
module.exports.normalizeUrl = normalizeUrl;

function getClient(config) {
  const baseURL = normalizeUrl(config.url);
  const auth = {
    username: config.credentials.consumerKey,
    password: config.credentials.consumerSecret,
  };
  const httpsAgent = WOOCOMMERCE_BYPASS_SSL
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;
  return axios.create({
    baseURL: `${baseURL}/wp-json/wc/v3`,
    auth,
    timeout: 15000,
    httpsAgent,
    validateStatus: () => true,
  });
}

async function validateCredentials(storeConfig) {
  try {
    const client = getClient(storeConfig);
    const res = await client.get('/system_status');
    if (res.status === 200 && res.data) return true;
    if (res.status === 401) return false;
    const res2 = await client.get('/products?per_page=1');
    return res2.status === 200;
  } catch (err) {
    return false;
  }
}

function stockStatusToOur(status) {
  if (status === 'instock' || status === 'in_stock') return 'in_stock';
  if (status === 'outofstock' || status === 'out_of_stock') return 'out_of_stock';
  return 'low_stock';
}

async function fetchProducts(storeConfig, options = {}) {
  const { page = 1, perPage = 100 } = options;
  const client = getClient(storeConfig);
  const res = await client.get('/products', {
    params: { page, per_page: perPage, orderby: 'id', order: 'asc' },
  });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    return { products: [] };
  }
  const products = res.data.map((p) => ({
    externalId: String(p.id),
    name: p.name || '',
    sku: p.sku || '',
    price: parseFloat(p.price) || 0,
    stock: parseInt(p.stock_quantity, 10) || 0,
    status: stockStatusToOur(p.stock_status),
    category: Array.isArray(p.categories) && p.categories[0] ? p.categories[0].name : '',
    image: Array.isArray(p.images) && p.images[0] ? p.images[0].src : '',
    description: (p.description || '').replace(/<[^>]*>/g, '').slice(0, 2000),
  }));
  const totalPages = parseInt(res.headers['x-wp-totalpages'], 10) || 1;
  const nextPage = page < totalPages ? page + 1 : null;
  return { products, nextPage };
}

async function fetchOrders(storeConfig, options = {}) {
  const { page = 1, perPage = 100 } = options;
  const client = getClient(storeConfig);
  const res = await client.get('/orders', {
    params: { page, per_page: perPage, orderby: 'date', order: 'desc' },
  });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    return { orders: [] };
  }
  const formatWcAddr = (addr) => {
    if (!addr || typeof addr !== 'object') return null;
    const parts = [addr.address_1, addr.address_2, addr.city, addr.state, addr.postcode, addr.country].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  };
  const status = (s) => (s || '').toLowerCase();
  const orders = res.data.map((o) => {
    const orderStatus = o.status || '';
    const orderStatusLower = status(orderStatus);
    return {
      externalId: String(o.id),
      orderId: o.number ? String(o.number) : String(o.id),
      date: o.date_created ? new Date(o.date_created) : new Date(),
      externalCustomerId: o.customer_id ? String(o.customer_id) : null,
      total: parseFloat(o.total) || 0,
      subtotal: null,
      discountTotal: parseFloat(o.discount_total) || 0,
      taxTotal: parseFloat(o.total_tax) || 0,
      currency: (o.currency || 'USD').toUpperCase(),
      note: (o.customer_note || '').trim() || null,
      shippingAddress: formatWcAddr(o.shipping) || null,
      billingAddress: formatWcAddr(o.billing) || null,
      status: mapWcOrderStatus(o.status),
      payment: orderStatusLower === 'refunded' ? 'refunded' : (o.date_paid ? 'paid' : 'pending'),
      financialStatus: orderStatusLower || undefined,
      fulfillmentStatus: orderStatusLower === 'completed' ? 'fulfilled' : (orderStatusLower === 'processing' ? 'in_transit' : 'unfulfilled'),
      items: Array.isArray(o.line_items) ? o.line_items.reduce((sum, i) => sum + (i.quantity || 0), 0) : 0,
      shippingLines: (o.shipping_lines || []).map((s) => ({
        title: s.method_title || 'Shipping',
        amount: parseFloat(s.total) || 0,
      })),
      discountCodes: (o.coupon_lines || []).map((c) => ({
        code: c.code || '',
        amount: parseFloat(c.discount) || 0,
      })),
      lineItems: (o.line_items || []).map((i) => ({
        name: i.name || '',
        quantity: i.quantity || 0,
        price: parseFloat(i.price) || 0,
        productId: i.product_id ? String(i.product_id) : undefined,
        variantId: i.variation_id ? String(i.variation_id) : undefined,
      })),
    };
  });
  const totalPages = parseInt(res.headers['x-wp-totalpages'], 10) || 1;
  const nextPage = page < totalPages ? page + 1 : null;
  return { orders, nextPage };
}

async function fetchOrderRefunds(storeConfig, orderExternalId) {
  const client = getClient(storeConfig);
  const res = await client.get(`/orders/${orderExternalId}`);
  if (res.status !== 200 || !res.data?.refunds) return [];
  return (res.data.refunds || []).map((r) => ({
    amount: parseFloat(r.total) || 0,
    reason: (r.reason || '').trim() || null,
    refundedAt: r.date_created ? new Date(r.date_created) : null,
  })).filter((r) => r.amount > 0);
}

function mapWcOrderStatus(s) {
  const status = (s || '').toLowerCase();
  if (['completed'].includes(status)) return 'completed';
  if (['cancelled', 'refunded', 'failed'].includes(status)) return 'cancelled';
  if (['processing'].includes(status)) return 'processing';
  return 'pending';
}

async function fetchCustomers(storeConfig, options = {}) {
  const { page = 1, perPage = 100 } = options;
  const client = getClient(storeConfig);
  const res = await client.get('/customers', {
    params: { page, per_page: perPage, orderby: 'id', order: 'asc' },
  });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    return { customers: [] };
  }
  const toAddr = (addr) => {
    if (!addr || typeof addr !== 'object') return null;
    return {
      address1: addr.address_1 || addr.address1 || '',
      address2: addr.address_2 || addr.address2 || '',
      city: addr.city || '',
      state: addr.state || '',
      zip: addr.postcode || addr.zip || '',
      country: addr.country || '',
      phone: addr.phone || '',
    };
  };
  const customers = res.data.map((c) => {
    const billing = toAddr(c.billing);
    const shipping = toAddr(c.shipping);
    const addresses = [billing, shipping].filter(Boolean);
    const seen = new Set();
    const unique = addresses.filter((a) => {
      const key = `${a.address1}|${a.city}|${a.country}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const loc = [c.billing?.city, c.billing?.state, c.billing?.country].filter(Boolean).join(', ');
    return {
      externalId: String(c.id),
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || 'Customer',
      email: c.email || '',
      phone: c.billing?.phone || c.shipping?.phone || '',
      location: loc || '',
      orders: parseInt(c.orders_count, 10) || 0,
      totalSpent: parseFloat(c.total_spent) || 0,
      lastOrder: c.last_order_date ? new Date(c.last_order_date) : null,
      status: 'active',
      tags: [],
      addresses: unique,
      defaultAddressIndex: 0,
    };
  });
  const totalPages = parseInt(res.headers['x-wp-totalpages'], 10) || 1;
  const nextPage = page < totalPages ? page + 1 : null;
  return { customers, nextPage };
}

/** Map WC discount_type to CRM: percent | fixed_cart | fixed_product -> percent | fixed */
function mapDiscountType(discountType) {
  if (discountType === 'percent') return 'percent';
  return 'fixed'; // fixed_cart, fixed_product
}

async function fetchCoupons(storeConfig, options = {}) {
  const { page = 1, perPage = 100 } = options;
  const client = getClient(storeConfig);
  const res = await client.get('/coupons', {
    params: { page, per_page: perPage, orderby: 'date', order: 'desc' },
  });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    return { coupons: [] };
  }
  const coupons = res.data.map((c) => {
    const amount = parseFloat(c.amount) || 0;
    return {
      externalId: String(c.id),
      code: c.code || '',
      description: c.description || '',
      discountType: mapDiscountType(c.discount_type),
      discountValue: amount,
      validFrom: c.date_created ? new Date(c.date_created) : null,
      validTo: c.date_expires ? new Date(c.date_expires) : (c.date_expires_gmt ? new Date(c.date_expires_gmt) : null),
      usageLimit: c.usage_limit != null ? parseInt(c.usage_limit, 10) : null,
      usedCount: parseInt(c.usage_count, 10) || 0,
    };
  });
  const totalPages = parseInt(res.headers['x-wp-totalpages'], 10) || 1;
  const nextPage = page < totalPages ? page + 1 : null;
  return { coupons, nextPage };
}

module.exports = {
  validateCredentials,
  normalizeUrl,
  getClient,
  fetchProducts,
  fetchOrders,
  fetchOrderRefunds,
  fetchCustomers,
  fetchCoupons,
};
