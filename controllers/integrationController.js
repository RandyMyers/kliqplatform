const Store = require('../models/Store');
const Product = require('../models/Product');
const { getAdapter } = require('../adapters');
const storeController = require('./storeController');

/** Fetch all products from WooCommerce (paginated). */
async function listWooCommerceProducts(req, res) {
  try {
    const { storeId } = req.params;
    const store = await Store.findOne({ _id: storeId, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    if (store.platform !== 'woocommerce') {
      return res.status(400).json({ message: 'Store is not a WooCommerce store' });
    }

    const credentials = storeController.getDecryptedCredentials(store);
    if (!credentials) return res.status(400).json({ message: 'Store credentials not configured' });

    const adapter = getAdapter('woocommerce');
    const storeConfig = { url: store.url, platform: 'woocommerce', credentials };
    const all = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const { products, nextPage } = await adapter.fetchProducts(storeConfig, { page, perPage });
      all.push(...(products || []));
      if (!nextPage || all.length >= 500) break;
      page = nextPage;
    }

    return res.json({ products: all });
  } catch (err) {
    console.error('listWooCommerceProducts error:', err);
    return res.status(500).json({ message: err.message || 'Failed to fetch WooCommerce products' });
  }
}

/** Fetch products from Shopify (first page; cursor pagination). */
async function listShopifyProducts(req, res) {
  try {
    const { storeId } = req.params;
    const store = await Store.findOne({ _id: storeId, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    if (store.platform !== 'shopify') {
      return res.status(400).json({ message: 'Store is not a Shopify store' });
    }

    const credentials = storeController.getDecryptedCredentials(store);
    if (!credentials) return res.status(400).json({ message: 'Store credentials not configured' });

    const adapter = getAdapter('shopify');
    const storeConfig = { url: store.url, platform: 'shopify', credentials };
    const all = [];
    let pageInfo = null;
    const limit = 250;
    let rounds = 0;
    const maxRounds = 4;

    while (rounds < maxRounds) {
      const { products, nextPageInfo } = await adapter.fetchProducts(storeConfig, { limit, pageInfo });
      all.push(...(products || []));
      if (!nextPageInfo) break;
      pageInfo = nextPageInfo;
      rounds++;
    }

    return res.json({ products: all });
  } catch (err) {
    console.error('listShopifyProducts error:', err);
    return res.status(500).json({ message: err.message || 'Failed to fetch Shopify products' });
  }
}

/** Import selected products. Expects products array with { externalId, name, sku, price, stock?, status?, category?, image?, description? }. */
async function importProducts(req, res) {
  try {
    const { storeId, source, externalProductIds, products: productsPayload } = req.body || {};

    if (!storeId || !source) {
      return res.status(400).json({ message: 'storeId and source are required' });
    }

    const store = await Store.findOne({ _id: storeId, userId: req.user._id });
    if (!store) return res.status(404).json({ message: 'Store not found' });

    const list = Array.isArray(productsPayload) && productsPayload.length > 0
      ? productsPayload
      : Array.isArray(externalProductIds) && externalProductIds.length > 0
        ? externalProductIds.map((extId) => ({ externalId: String(extId), name: `Imported product ${extId}`, sku: '', price: 0, stock: 0, status: 'in_stock', category: '', image: '', description: '' }))
        : [];

    if (list.length === 0) {
      return res.status(400).json({ message: 'Provide products array or externalProductIds' });
    }

    const created = [];
    for (const p of list) {
      const externalId = p.externalId || p.id;
      const name = (p.name || p.title || '').trim() || `Imported ${source} product`;
      const price = typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;
      const sku = (p.sku || '').trim() || undefined;
      const stock = typeof p.stock === 'number' ? p.stock : parseInt(p.stock, 10) || 0;
      const status = ['in_stock', 'low_stock', 'out_of_stock'].includes(p.status) ? p.status : 'in_stock';
      const category = (p.category || '').trim() || undefined;
      const image = (p.image || p.imageUrl || '').trim() || undefined;
      const description = (p.description || '').trim() || undefined;

      const product = await Product.create({
        name,
        sku,
        price,
        stock,
        status,
        storeId: store._id,
        externalId: externalId ? String(externalId) : undefined,
        category,
        image,
        description,
        userId: req.user._id,
      });
      created.push(product);
    }

    return res.status(201).json({ imported: created.length, products: created });
  } catch (err) {
    console.error('importProducts error:', err);
    return res.status(500).json({ message: err.message || 'Failed to import products' });
  }
}

module.exports = {
  listWooCommerceProducts,
  listShopifyProducts,
  importProducts,
};

