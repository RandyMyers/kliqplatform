const axios = require('axios');

const SHOPIFY_API_VERSION = '2024-01';

function normalizeShopUrl(url) {
  let u = url.trim().toLowerCase();
  if (!u.startsWith('http')) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}
module.exports.normalizeUrl = normalizeShopUrl;

function getClient(config) {
  const baseURL = normalizeShopUrl(config.url);
  const token = config.credentials.accessToken;
  return axios.create({
    baseURL: `${baseURL}/admin/api/${SHOPIFY_API_VERSION}`,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    timeout: 15000,
    validateStatus: () => true,
  });
}

async function validateCredentials(storeConfig) {
  try {
    const client = getClient(storeConfig);
    const res = await client.get('/shop.json');
    if (res.status === 200 && res.data && res.data.shop) return true;
    return false;
  } catch (err) {
    return false;
  }
}

function parseNextPageInfo(linkHeader) {
  if (!linkHeader || typeof linkHeader !== 'string') return null;
  const match = linkHeader.match(/<[^>]*[?&]page_info=([^>&]+)[^>]*>;\s*rel="next"/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function fetchProducts(storeConfig, options = {}) {
  const { limit = 250, pageInfo = null } = options;
  const client = getClient(storeConfig);
  const params = { limit };
  if (pageInfo) params.page_info = pageInfo;
  const res = await client.get('/products.json', { params });
  if (res.status !== 200 || !res.data?.products) {
    return { products: [] };
  }
  const products = [];
  for (const p of res.data.products) {
    const v = p.variants && p.variants[0];
    const price = v ? parseFloat(v.price) : 0;
    const sku = v ? (v.sku || '') : '';
    products.push({
      externalId: String(p.id),
      name: p.title || '',
      sku,
      price,
      stock: 0,
      status: 'in_stock',
      category: p.product_type || '',
      image: p.image?.src || (p.images && p.images[0]?.src) || '',
      description: (p.body_html || '').replace(/<[^>]*>/g, '').slice(0, 2000),
    });
  }
  const nextPageInfo = parseNextPageInfo(res.headers.link);
  return { products, nextPageInfo };
}

function mapShopifyFinancialStatus(s) {
  const status = (s || '').toLowerCase();
  if (['paid', 'partially_refunded'].includes(status)) return 'paid';
  return 'pending';
}

function mapShopifyFulfillmentStatus(s) {
  const status = (s || '').toLowerCase();
  if (['fulfilled'].includes(status)) return 'completed';
  if (['cancelled'].includes(status)) return 'cancelled';
  return 'processing';
}

async function fetchOrders(storeConfig, options = {}) {
  const { limit = 250, pageInfo = null } = options;
  const client = getClient(storeConfig);
  const params = { limit };
  if (pageInfo) params.page_info = pageInfo;
  const res = await client.get('/orders.json', { params });
  if (res.status !== 200 || !res.data?.orders) {
    return { orders: [] };
  }
  const orders = res.data.orders.map((o) => {
    const ship = o.shipping_address || o.default_address;
    const bill = o.billing_address;
    const formatAddr = (addr) => {
      if (!addr) return null;
      const parts = [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country].filter(Boolean);
      return parts.length ? parts.join(', ') : null;
    };
    const financialStatus = (o.financial_status || '').toLowerCase();
    const fulfillmentStatus = (o.fulfillment_status || '').toLowerCase();
    return {
      externalId: String(o.id),
      orderId: o.order_number ? String(o.order_number) : String(o.id),
      date: o.created_at ? new Date(o.created_at) : new Date(),
      externalCustomerId: o.customer?.id ? String(o.customer.id) : null,
      total: parseFloat(o.total_price) || 0,
      subtotal: o.subtotal_price != null ? parseFloat(o.subtotal_price) : null,
      discountTotal: parseFloat(o.total_discounts) || 0,
      taxTotal: o.total_tax != null ? parseFloat(o.total_tax) : 0,
      currency: (o.currency || o.presentment_currency || 'USD').toUpperCase(),
      note: (o.note || '').trim() || null,
      shippingAddress: formatAddr(ship) || (ship && typeof ship === 'object' ? ship : null),
      billingAddress: formatAddr(bill) || (bill && typeof bill === 'object' ? bill : null),
      status: mapShopifyFulfillmentStatus(o.fulfillment_status),
      payment: financialStatus === 'refunded' ? 'refunded' : mapShopifyFinancialStatus(o.financial_status),
      financialStatus: financialStatus || undefined,
      fulfillmentStatus: fulfillmentStatus || undefined,
      items: (o.line_items || []).reduce((sum, i) => sum + (i.quantity || 0), 0),
      shippingLines: (o.shipping_lines || []).map((s) => ({
        title: s.title || 'Shipping',
        amount: parseFloat(s.price) || 0,
      })),
      discountCodes: (o.discount_codes || []).map((d) => ({
        code: d.code || '',
        amount: parseFloat(d.amount) || 0,
      })),
      lineItems: (o.line_items || []).map((i) => ({
        name: i.title || '',
        quantity: i.quantity || 0,
        price: parseFloat(i.price) || 0,
        productId: i.product_id ? String(i.product_id) : undefined,
        variantId: i.variant_id ? String(i.variant_id) : undefined,
      })),
    };
  });
  const nextPageInfo = parseNextPageInfo(res.headers.link);
  return { orders, nextPageInfo };
}

async function fetchOrderRefunds(storeConfig, orderExternalId) {
  const client = getClient(storeConfig);
  const res = await client.get(`/orders/${orderExternalId}/refunds.json`, { params: { limit: 50 } });
  if (res.status !== 200 || !res.data?.refunds) return [];
  return res.data.refunds.map((r) => {
    const transactions = r.transactions || [];
    const amount = transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    return {
      amount,
      reason: (r.note || '').trim() || null,
      refundedAt: r.created_at ? new Date(r.created_at) : null,
    };
  }).filter((r) => r.amount > 0);
}

async function fetchCustomers(storeConfig, options = {}) {
  const { limit = 250, pageInfo = null } = options;
  const client = getClient(storeConfig);
  const params = { limit };
  if (pageInfo) params.page_info = pageInfo;
  const res = await client.get('/customers.json', { params });
  if (res.status !== 200 || !res.data?.customers) {
    return { customers: [] };
  }
  const customers = res.data.customers.map((c) => {
    const defaultAddr = c.default_address;
    const loc = [defaultAddr?.city, defaultAddr?.province, defaultAddr?.country].filter(Boolean).join(', ');
    const tagsStr = (c.tags || '').trim();
    const addressList = (c.addresses || []).map((a) => ({
      address1: a.address1 || '',
      address2: a.address2 || '',
      city: a.city || '',
      state: a.province || a.state || '',
      zip: a.zip || '',
      country: a.country || '',
      phone: a.phone || '',
    }));
    const defaultIdx = defaultAddr && addressList.length
      ? addressList.findIndex((a) => a.address1 === defaultAddr.address1 && a.city === defaultAddr.city)
      : 0;
    return {
      externalId: String(c.id),
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Customer',
      email: c.email || '',
      phone: c.phone || '',
      location: loc || '',
      orders: parseInt(c.orders_count, 10) || 0,
      totalSpent: parseFloat(c.total_spent) || 0,
      lastOrder: c.last_order_id ? null : null,
      status: (c.state || 'enabled').toLowerCase() === 'disabled' ? 'inactive' : 'active',
      tags: tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [],
      addresses: addressList.length ? addressList : (defaultAddr ? [{
        address1: defaultAddr.address1 || '',
        address2: defaultAddr.address2 || '',
        city: defaultAddr.city || '',
        state: defaultAddr.province || defaultAddr.state || '',
        zip: defaultAddr.zip || '',
        country: defaultAddr.country || '',
        phone: defaultAddr.phone || '',
      }] : []),
      defaultAddressIndex: defaultIdx >= 0 ? defaultIdx : 0,
    };
  });
  const nextPageInfo = parseNextPageInfo(res.headers.link);
  return { customers, nextPageInfo };
}

/**
 * Fetch inventory levels for all products. Returns map of product externalId -> total available (sum across variants/locations).
 * Requires read_inventory scope. Paginates products, collects variant inventory_item_ids, then batch-fetches inventory_levels.
 */
async function fetchInventory(storeConfig, options = {}) {
  const client = getClient(storeConfig);
  const invItemIdToProductId = {};
  let pageInfo = null;
  const limit = 250;

  while (true) {
    const params = { limit };
    if (pageInfo) params.page_info = pageInfo;
    const res = await client.get('/products.json', { params });
    if (res.status !== 200 || !res.data?.products) break;
    for (const p of res.data.products) {
      const productId = String(p.id);
      if (p.variants && Array.isArray(p.variants)) {
        for (const v of p.variants) {
          if (v.inventory_item_id) {
            invItemIdToProductId[String(v.inventory_item_id)] = productId;
          }
        }
      }
    }
    pageInfo = parseNextPageInfo(res.headers.link);
    if (!pageInfo) break;
  }

  const productStock = {};
  const ids = Object.keys(invItemIdToProductId);
  const batchSize = 50;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const levelsRes = await client.get('/inventory_levels.json', {
      params: { inventory_item_ids: batch.join(',') },
    });
    if (levelsRes.status === 200 && Array.isArray(levelsRes.data?.inventory_levels)) {
      for (const level of levelsRes.data.inventory_levels) {
        const productId = invItemIdToProductId[String(level.inventory_item_id)];
        if (productId) {
          productStock[productId] = (productStock[productId] || 0) + (level.available || 0);
        }
      }
    }
  }
  return { productStock };
}

/**
 * Fetch price rules (Shopify discount rules). Paginated via Link header.
 * Requires price_rules read scope.
 */
async function fetchPriceRules(storeConfig, options = {}) {
  const { limit = 250, pageInfo = null } = options;
  const client = getClient(storeConfig);
  const params = { limit };
  if (pageInfo) params.page_info = pageInfo;
  const res = await client.get('/price_rules.json', { params });
  if (res.status !== 200 || !res.data?.price_rules) {
    return { priceRules: [] };
  }
  const nextPageInfo = parseNextPageInfo(res.headers.link);
  return { priceRules: res.data.price_rules, nextPageInfo };
}

/**
 * Fetch discount codes for a single price rule. Paginated via Link header.
 */
async function fetchDiscountCodesForPriceRule(storeConfig, priceRuleId, options = {}) {
  const { limit = 250, pageInfo = null } = options;
  const client = getClient(storeConfig);
  const params = { limit };
  if (pageInfo) params.page_info = pageInfo;
  const res = await client.get(`/price_rules/${priceRuleId}/discount_codes.json`, { params });
  if (res.status !== 200 || !res.data?.discount_codes) {
    return { discountCodes: [] };
  }
  const nextPageInfo = parseNextPageInfo(res.headers.link);
  return { discountCodes: res.data.discount_codes, nextPageInfo };
}

/**
 * Fetch all coupons from Shopify: all price rules + their discount codes, flattened to one coupon per code.
 * Return shape: { coupons: [...], nextPageInfo } for compatibility; we aggregate in one go so nextPageInfo is null when done.
 */
async function fetchCoupons(storeConfig, options = {}) {
  const client = getClient(storeConfig);
  const allCoupons = [];
  let pageInfo = null;

  // Paginate price rules
  while (true) {
    const rulesRes = await fetchPriceRules(storeConfig, { limit: 50, pageInfo });
    const priceRules = rulesRes.priceRules || [];
    if (priceRules.length === 0 && allCoupons.length === 0) break;

    for (const rule of priceRules) {
      const ruleId = String(rule.id);
      const valueType = (rule.value_type || 'fixed_amount').toLowerCase();
      const discountType = valueType === 'percentage' ? 'percent' : 'fixed';
      const discountValue = Math.abs(parseFloat(rule.value) || 0);
      let codePageInfo = null;

      // Paginate discount codes for this rule
      while (true) {
        const codesRes = await fetchDiscountCodesForPriceRule(storeConfig, ruleId, { limit: 250, pageInfo: codePageInfo });
        const codes = codesRes.discountCodes || [];
        for (const dc of codes) {
          allCoupons.push({
            externalId: String(dc.id),
            priceRuleId: ruleId,
            code: dc.code || '',
            description: rule.title || '',
            discountType,
            discountValue,
            validFrom: rule.starts_at ? new Date(rule.starts_at) : null,
            validTo: rule.ends_at ? new Date(rule.ends_at) : null,
            usageLimit: rule.usage_limit != null ? parseInt(rule.usage_limit, 10) : null,
            usedCount: parseInt(dc.usage_count, 10) || 0,
          });
        }
        codePageInfo = codesRes.nextPageInfo;
        if (!codePageInfo) break;
      }
    }

    pageInfo = rulesRes.nextPageInfo;
    if (!pageInfo) break;
  }

  return { coupons: allCoupons, nextPageInfo: null };
}

module.exports = {
  validateCredentials,
  normalizeShopUrl,
  normalizeUrl: normalizeShopUrl,
  getClient,
  fetchProducts,
  fetchOrders,
  fetchOrderRefunds,
  fetchCustomers,
  fetchInventory,
  fetchPriceRules,
  fetchDiscountCodesForPriceRule,
  fetchCoupons,
};
