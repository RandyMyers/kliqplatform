const Store = require('../models/Store');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Coupon = require('../models/Coupon');
const { getAdapter } = require('../adapters');
const { decrypt } = require('./encryption');

function getStoreConfig(store) {
  if (!store.credentialsEncrypted) return null;
  try {
    const credentials = JSON.parse(decrypt(store.credentialsEncrypted));
    return {
      url: store.url,
      platform: store.platform,
      credentials,
    };
  } catch {
    return null;
  }
}

async function syncProducts(storeId, userId) {
  const store = await Store.findOne({ _id: storeId, userId });
  if (!store) throw new Error('Store not found');
  const storeConfig = getStoreConfig(store);
  if (!storeConfig) throw new Error('Store credentials not available');
  const adapter = getAdapter(store.platform);
  if (!adapter.fetchProducts) throw new Error('Adapter does not support product sync');

  let page = 1;
  let pageInfo = null;
  let total = 0;

  while (true) {
    const options = { page, perPage: 100, pageInfo };
    const result = await adapter.fetchProducts(storeConfig, options);
    const products = result.products || [];
    if (products.length === 0 && total === 0) break;

    for (const p of products) {
      await Product.findOneAndUpdate(
        { storeId, externalId: p.externalId },
        {
          $set: {
            name: p.name,
            sku: p.sku,
            price: p.price,
            stock: p.stock != null ? p.stock : 0,
            status: p.status || 'in_stock',
            category: p.category,
            image: p.image,
            description: p.description,
            userId,
            storeId,
            externalId: p.externalId,
          },
        },
        { upsert: true, new: true }
      );
      total += 1;
    }

    const hasNext = result.nextPage != null || result.nextPageInfo != null;
    if (!hasNext) break;
    if (result.nextPage != null) page = result.nextPage;
    if (result.nextPageInfo != null) pageInfo = result.nextPageInfo;
  }

  store.lastSync = new Date();
  await store.save();
  return { synced: total };
}

async function syncCustomers(storeId, userId) {
  const store = await Store.findOne({ _id: storeId, userId });
  if (!store) throw new Error('Store not found');
  const storeConfig = getStoreConfig(store);
  if (!storeConfig) throw new Error('Store credentials not available');
  const adapter = getAdapter(store.platform);
  if (!adapter.fetchCustomers) throw new Error('Adapter does not support customer sync');

  let page = 1;
  let pageInfo = null;
  let total = 0;

  while (true) {
    const options = { page, perPage: 100, pageInfo };
    const result = await adapter.fetchCustomers(storeConfig, options);
    const customers = result.customers || [];
    if (customers.length === 0 && total === 0) break;

    for (const c of customers) {
      await Customer.findOneAndUpdate(
        { storeId, externalId: c.externalId },
        {
          $set: {
            name: c.name,
            email: c.email,
            phone: c.phone,
            location: c.location,
            orders: c.orders != null ? c.orders : 0,
            totalSpent: c.totalSpent != null ? c.totalSpent : 0,
            lastOrder: c.lastOrder,
            status: c.status || 'active',
            tags: Array.isArray(c.tags) ? c.tags : [],
            addresses: Array.isArray(c.addresses) ? c.addresses : [],
            defaultAddressIndex: c.defaultAddressIndex != null ? c.defaultAddressIndex : 0,
            userId,
            storeId,
            externalId: c.externalId,
          },
        },
        { upsert: true, new: true }
      );
      total += 1;
    }

    const hasNext = result.nextPage != null || result.nextPageInfo != null;
    if (!hasNext) break;
    if (result.nextPage != null) page = result.nextPage;
    if (result.nextPageInfo != null) pageInfo = result.nextPageInfo;
  }

  store.lastSync = new Date();
  await store.save();
  return { synced: total };
}

async function syncOrders(storeId, userId) {
  const store = await Store.findOne({ _id: storeId, userId });
  if (!store) throw new Error('Store not found');
  const storeConfig = getStoreConfig(store);
  if (!storeConfig) throw new Error('Store credentials not available');
  const adapter = getAdapter(store.platform);
  if (!adapter.fetchOrders) throw new Error('Adapter does not support order sync');

  let page = 1;
  let pageInfo = null;
  let total = 0;

  while (true) {
    const options = { page, perPage: 100, pageInfo };
    const result = await adapter.fetchOrders(storeConfig, options);
    const orders = result.orders || [];
    if (orders.length === 0 && total === 0) break;

    for (const o of orders) {
      let customerId = null;
      if (o.externalCustomerId) {
        const cust = await Customer.findOne({
          storeId,
          externalId: o.externalCustomerId,
        });
        if (cust) customerId = cust._id;
      }
      let refunds = [];
      if (adapter.fetchOrderRefunds) {
        try {
          refunds = await adapter.fetchOrderRefunds(storeConfig, o.externalId);
        } catch (_) {
          // ignore per-order refund fetch errors
        }
      }
      await Order.findOneAndUpdate(
        { storeId, externalId: o.externalId },
        {
          $set: {
            orderId: o.orderId,
            date: o.date,
            customerId,
            total: o.total,
            subtotal: o.subtotal != null ? o.subtotal : undefined,
            discountTotal: o.discountTotal != null ? o.discountTotal : 0,
            taxTotal: o.taxTotal != null ? o.taxTotal : 0,
            currency: o.currency || 'USD',
            note: o.note || null,
            shippingAddress: o.shippingAddress || null,
            billingAddress: o.billingAddress || null,
            status: o.status || 'pending',
            payment: o.payment || 'pending',
            financialStatus: o.financialStatus || undefined,
            fulfillmentStatus: o.fulfillmentStatus || undefined,
            items: o.items != null ? o.items : 0,
            shippingLines: Array.isArray(o.shippingLines) ? o.shippingLines : [],
            discountCodes: Array.isArray(o.discountCodes) ? o.discountCodes : [],
            refunds,
            lineItems: (o.lineItems || []).map((li) => ({
              name: li.name,
              quantity: li.quantity || 0,
              price: li.price || 0,
              productId: li.productId || undefined,
              variantId: li.variantId || undefined,
            })),
            userId,
            storeId,
            externalId: o.externalId,
          },
        },
        { upsert: true, new: true }
      );
      total += 1;
    }

    const hasNext = result.nextPage != null || result.nextPageInfo != null;
    if (!hasNext) break;
    if (result.nextPage != null) page = result.nextPage;
    if (result.nextPageInfo != null) pageInfo = result.nextPageInfo;
  }

  store.lastSync = new Date();
  await store.save();
  return { synced: total };
}

async function syncCoupons(storeId, userId) {
  const store = await Store.findOne({ _id: storeId, userId });
  if (!store) throw new Error('Store not found');
  const storeConfig = getStoreConfig(store);
  if (!storeConfig) throw new Error('Store credentials not available');
  const adapter = getAdapter(store.platform);
  if (!adapter.fetchCoupons) throw new Error('Adapter does not support coupon sync');

  let page = 1;
  let pageInfo = null;
  let total = 0;
  const platform = store.platform;

  while (true) {
    const options = { page, perPage: 100, pageInfo };
    const result = await adapter.fetchCoupons(storeConfig, options);
    const coupons = result.coupons || [];
    if (coupons.length === 0 && total === 0) break;

    for (const c of coupons) {
      await Coupon.findOneAndUpdate(
        { storeId, externalId: c.externalId },
        {
          $set: {
            code: (c.code || '').trim().toUpperCase(),
            discountType: c.discountType || 'fixed',
            discountValue: c.discountValue != null ? Number(c.discountValue) : 0,
            description: c.description || null,
            validFrom: c.validFrom || null,
            validTo: c.validTo || null,
            usageLimit: c.usageLimit != null ? Number(c.usageLimit) : null,
            usedCount: c.usedCount != null ? Number(c.usedCount) : 0,
            storeId,
            userId,
            externalId: c.externalId,
            platform,
            priceRuleId: c.priceRuleId || null,
          },
        },
        { upsert: true, new: true }
      );
      total += 1;
    }

    const hasNext = result.nextPage != null || result.nextPageInfo != null;
    if (!hasNext) break;
    if (result.nextPage != null) page = result.nextPage;
    if (result.nextPageInfo != null) pageInfo = result.nextPageInfo;
  }

  store.lastSync = new Date();
  await store.save();
  return { synced: total };
}

async function syncAll(storeId, userId) {
  const customersResult = await syncCustomers(storeId, userId);
  const [productsResult, ordersResult, couponsResult] = await Promise.all([
    syncProducts(storeId, userId),
    syncOrders(storeId, userId),
    syncCoupons(storeId, userId).catch(() => ({ synced: 0 })),
  ]);
  return {
    products: productsResult.synced,
    customers: customersResult.synced,
    orders: ordersResult.synced,
    coupons: couponsResult.synced,
  };
}

/** Shopify only: fetch inventory levels and update Product.stock (and status) for all products in store. */
async function syncInventory(storeId, userId) {
  const store = await Store.findOne({ _id: storeId, userId });
  if (!store) throw new Error('Store not found');
  if (store.platform !== 'shopify') throw new Error('Inventory sync is only supported for Shopify stores');
  const storeConfig = getStoreConfig(store);
  if (!storeConfig) throw new Error('Store credentials not available');
  const adapter = getAdapter(store.platform);
  if (!adapter.fetchInventory) throw new Error('Adapter does not support inventory sync');

  const { productStock } = await adapter.fetchInventory(storeConfig, {});
  let updated = 0;
  for (const [externalId, available] of Object.entries(productStock)) {
    const stock = parseInt(available, 10) || 0;
    const status = stock <= 0 ? 'out_of_stock' : stock <= 10 ? 'low_stock' : 'in_stock';
    const result = await Product.findOneAndUpdate(
      { storeId, externalId },
      { $set: { stock, status } },
      { new: true }
    );
    if (result) updated += 1;
  }
  store.lastSync = new Date();
  await store.save();
  return { synced: updated };
}

module.exports = { syncProducts, syncCustomers, syncOrders, syncCoupons, syncAll, syncInventory };
