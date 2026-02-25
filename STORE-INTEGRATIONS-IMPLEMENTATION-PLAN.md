# Store Integrations Implementation Plan

## 1. Analysis of Reference APIs

### 1.1 Shopify (shopify.txt)

**Source:** REST Admin API reference; versioned (e.g. `2025-07`).

| Aspect | Details |
|--------|---------|
| **Base URL** | `https://{store}.myshopify.com/admin/api/{version}/` |
| **Auth** | `X-Shopify-Access-Token` header (OAuth / custom app token). Scopes required (e.g. `read_products`, `write_orders`, `read_orders`). |
| **Rate limit** | 40 requests/app/store/minute (2/sec replenish); 10× for Shopify Plus. |
| **Pagination** | Cursor-based (Link header). |
| **Products** | `GET/POST /products.json`, `GET/PUT /products/{id}.json`. Product has `id`, `title`, `variants[]` (each with `id`, `price`, `sku`, `inventory_item_id`). |
| **Inventory** | `InventoryItem` (SKU, tracked); `InventoryLevel` (location + quantity). Endpoints: `GET/PUT inventory_items`, `GET inventory_items?ids=`, `POST inventory_levels/adjust`, `POST inventory_levels/set`, `GET inventory_levels?location_ids= or inventory_item_id=`. Requires `inventory` scope. |
| **Orders** | `GET/POST /orders.json`, `GET/PUT /orders/{id}.json`. Order has `id`, `order_number`, `customer`, `total_price`, `financial_status`, `fulfillment_status`, `line_items[]`. |
| **Customers** | `GET/POST /customers.json`, `GET/PUT/DELETE /customers/{id}.json`, `GET /customers/{id}/orders.json`, `GET /customers/count.json`, `GET /customers/search.json?query=`. |

**Relevant resources:** Products, Product Variants, InventoryItem, InventoryLevel, Orders, Customers, Locations.

---

### 1.2 WooCommerce (woocommerce.txt)

**Source:** WordPress REST API; WooCommerce uses `wc/v3` namespace.

| Aspect | Details |
|--------|---------|
| **Base URL** | `https://{store-domain}/wp-json/wc/v3/` |
| **Auth** | (1) **HTTPS:** Basic Auth: Consumer Key (username), Consumer Secret (password). (2) **HTTP:** OAuth 1.0a one-legged. (3) Optional: Application Auth via `/wc-auth/v1/authorize` (redirect + callback with keys). |
| **Pagination** | `page`, `per_page`, `offset`; total in `X-WP-Total`, `X-WP-TotalPages`; Link header for next/prev. |
| **Products** | `GET/POST /products`, `GET/PUT/DELETE /products/{id}`, `GET /products?search=, status=, sku=, category=, tag=, in_stock=`. Product has `id`, `name`, `sku`, `price`, `regular_price`, `stock_quantity`, `stock_status` (instock/outofstock/onbackorder), `categories`, `images`. |
| **Inventory** | No separate “inventory items” API; stock is on product/variation: `stock_quantity`, `stock_status`, `manage_stock`. Variations: `/products/{product_id}/variations`. |
| **Orders** | `GET/POST /orders`, `GET/PUT/DELETE /orders/{id}`, `GET /orders?status=, customer=, product=`. Order has `id`, `number`, `status` (pending, processing, on-hold, completed, cancelled, refunded, failed), `total`, `customer_id`, `line_items[]`. |
| **Customers** | `GET/POST /customers`, `GET/PUT/DELETE /customers/{id}`, batch endpoints. |

**.env:** `WOOCOMMERCE_BYPASS_SSL=true` (development only) — used when store uses self-signed or invalid SSL.

---

### 1.3 Comparison: What We Need to Retrieve

| Data | WooCommerce | Shopify |
|------|-------------|---------|
| **Products** | `/wc/v3/products` (includes stock_quantity, stock_status) | `/admin/api/.../products.json`; variants have `inventory_item_id` → InventoryItem/InventoryLevel for stock |
| **Inventories** | On product/variation (stock_quantity, manage_stock) | InventoryItem + InventoryLevel (multi-location) |
| **Orders** | `/wc/v3/orders` | `/admin/api/.../orders.json` |
| **Customers** | `/wc/v3/customers` | `/admin/api/.../customers.json` |
| **Auth** | Consumer Key + Secret (Basic or OAuth 1.0a) | Access token (header) |

---

## 2. Current Server & Client Analysis

### 2.1 Server (NewCrm/server)

- **Stack:** Express, MongoDB (Mongoose), JWT auth, Cloudinary, file upload, CORS.
- **Models:** User, Store, StoreGroup, Product, Order, Customer, Task, ContactSubmission. No `platform` or `credentials` on Store yet.
- **Store model:** `name`, `url`, `status`, `admin`, `location`, `userId`. No `platform` (woocommerce | shopify | …) or encrypted credentials.
- **Controllers/Routes:** CRUD for stores, products, orders, customers, tasks; all scoped by `userId`. Data is **internal only** (MongoDB). No code yet that calls WooCommerce or Shopify APIs.
- **.env:** `WOOCOMMERCE_BYPASS_SSL=true` indicates WooCommerce integration was planned; no Shopify env vars.

**Gap:** There is no “store integration” layer: no fetching or syncing from WooCommerce/Shopify into our DB, and no mapping of external IDs to our models.

### 2.2 Client (NewCrm/client)

- **Stores page:** Uses `/api/stores` and `/api/stores/stats`; shows list and stats. No “Connect Store” form that sends platform + credentials.
- **Products / Orders / Customers pages:** Use mock data or local API only; no “sync from store” or “refresh from WooCommerce/Shopify”.
- **Purple reference:** `StoreConnectionForm` collects name, url, consumerKey, consumerSecret (WooCommerce). No Shopify (store + token) or platform selector.

**Gap:** UI does not distinguish “WooCommerce store” vs “Shopify store”; no credential input per platform; no sync/refresh actions that call backend to pull from external APIs.

---

## 3. Target Architecture: Multi-Store Integrations

### 3.1 Design Principles

1. **Platform-agnostic core:** Our API and DB stay platform-agnostic (Store, Product, Order, Customer). All platform-specific logic lives behind adapters.
2. **Adapter per platform:** One “adapter” per platform (WooCommerce, Shopify, …) that knows how to:
   - Authenticate
   - Map platform resources → our normalized DTOs
   - Handle rate limits and pagination
3. **Store record = connection:** Each Store in DB has `platform` and platform-specific credentials (encrypted). Sync jobs or “Pull” actions call the right adapter and write into our Product/Order/Customer collections (with `storeId` + optional `externalId`).
4. **Future platforms:** New file (e.g. `adapters/bigcommerce.js`) and registration in a small “adapter registry”; no change to core API or client flows.

### 3.2 Data Flow

```
[Client] Connect Store (platform + credentials)
    → POST /api/stores (with platform, url, credentials)
    → Server validates credentials (e.g. GET shop or GET /products?per_page=1)
    → Store saved (credentials encrypted)

[Client] “Sync products” / “Refresh”
    → POST /api/stores/:id/sync/products (or cron)
    → Server loads Store, picks adapter by platform
    → Adapter fetches products (paginated), maps to our Product shape
    → Upsert Product by (storeId, externalId)

Same for orders, customers, inventory (where supported).
```

### 3.3 Normalized Shapes (Our API / DB)

- **Product:** name, sku, price, stock (or stockStatus), storeId, externalId, platform, image, category, etc.
- **Order:** orderId (our display id), externalId, storeId, customerId, total, status, paymentStatus, lineItems[], date.
- **Customer:** name, email, phone, storeId, externalId, ordersCount, totalSpent, lastOrderAt.
- **Inventory (optional):** For Shopify we may keep an InventoryLevel cache or derive from variants; for WooCommerce we use product/variation stock fields.

---

## 4. Implementation Plan

### Phase 1: Store Model & Credentials (WooCommerce + Shopify)

**1.1 Store schema changes**

- Add `platform`: `enum: ['woocommerce', 'shopify']` (required for connected stores).
- Add `credentials`: `Object` (encrypted at rest):
  - WooCommerce: `{ consumerKey, consumerSecret }`
  - Shopify: `{ accessToken }` (and optionally `shopDomain` if not derived from url)
- Add `externalId` / `externalStoreId` if we need to store the platform’s store/shop id.
- Keep `url` as the store root (e.g. `https://example.com` for WC, `https://store.myshopify.com` for Shopify).

**1.2 Credential storage**

- Use a single encryption key in env (e.g. `STORE_CREDENTIALS_SECRET`).
- Encrypt before save, decrypt when calling adapters (never return raw credentials to client).

**1.3 Validation endpoint (per platform)**

- **WooCommerce:** `GET {url}/wp-json/wc/v3/system_status` or `GET .../products?per_page=1` with Basic Auth. If `WOOCOMMERCE_BYPASS_SSL=true`, use `rejectUnauthorized: false` in Node only in dev.
- **Shopify:** `GET https://{shop}/admin/api/2024-01/shop.json` with `X-Shopify-Access-Token`. Parse shop domain from `url` (e.g. `store.myshopify.com`).

**1.4 API**

- `POST /api/stores` — body: `{ name, url, platform, credentials }`. Validate with adapter, then save (encrypted).
- `PUT /api/stores/:id` — allow updating name, url, status; credentials optional (if present, re-validate and re-encrypt).
- Responses never include raw credentials.

**1.5 Client**

- “Connect Store” form: dropdown **Platform** (WooCommerce | Shopify).  
  - If WooCommerce: fields Store URL, Consumer Key, Consumer Secret.  
  - If Shopify: fields Store URL (e.g. `mystore.myshopify.com`), Access Token.  
- On submit: `POST /api/stores` with `platform` and credentials. Show success/error from validation.

---

### Phase 2: Adapters (WooCommerce & Shopify)

**2.1 Adapter interface (internal)**

Each adapter exports:

- `validateCredentials(storeConfig)` → Promise<boolean>
- `fetchProducts(storeConfig, options)` → Promise<{ products: NormalizedProduct[], nextPage? }>
- `fetchOrders(storeConfig, options)` → Promise<{ orders: NormalizedOrder[], nextPage? }>
- `fetchCustomers(storeConfig, options)` → Promise<{ customers: NormalizedCustomer[], nextPage? }>
- (Optional) `fetchInventory(storeConfig, options)` for Shopify

**2.2 WooCommerce adapter**

- Use `axios` or `node-fetch` with Basic Auth (consumer key/secret).  
- Products: `GET /wp-json/wc/v3/products?per_page=100&page=…`; map to our Product (name, sku, price, stock_quantity, stock_status, id → externalId).  
- Orders: `GET /wp-json/wc/v3/orders?per_page=100&page=…`; map to our Order.  
- Customers: `GET /wp-json/wc/v3/customers?per_page=100&page=…`; map to our Customer.  
- Inventory: use product’s `stock_quantity` and `stock_status` (no separate inventory API).  
- Honor `WOOCOMMERCE_BYPASS_SSL` for development (HTTPS with rejectUnauthorized: false).

**2.3 Shopify adapter**

- Use `axios`/`fetch` with `X-Shopify-Access-Token`.  
- Products: `GET /admin/api/2024-01/products.json?limit=250`; map product + first variant (or iterate variants) to our Product; store variant’s `inventory_item_id` for inventory.  
- Inventory: `GET inventory_items?ids=…` and `GET inventory_levels?inventory_item_ids=…` (or by location); map to stock per product/variant.  
- Orders: `GET /admin/api/2024-01/orders.json?limit=250`; map to our Order.  
- Customers: `GET /admin/api/2024-01/customers.json?limit=250`; map to our Customer.  
- Use cursor/link pagination from response headers.  
- Respect rate limit (40/min); optional simple queue or retry-after.

**2.4 Adapter registry**

- `adapters/index.js`: `getAdapter(platform)` → wooCommerceAdapter | shopifyAdapter; throw if unknown.  
- Keeps Phase 2+ additions (e.g. BigCommerce) to one new file + one line in registry.

---

### Phase 3: Sync Service & API

**3.1 Product/Order/Customer models**

- Ensure `storeId`, `externalId`, and (optional) `platform` exist.  
- Unique index on `(storeId, externalId)` for upserts.

**3.2 Sync service (server-side)**

- `services/syncService.js`:
  - `syncProducts(storeId)` — load Store, get adapter, fetch all pages, upsert Products.
  - `syncOrders(storeId)` — same for Orders.
  - `syncCustomers(storeId)` — same for Customers.
  - Optional: `syncInventory(storeId)` for Shopify.
- Use adapter’s pagination until no next page; batch upsert (e.g. bulkWrite) for performance.
- Set `lastSync` on Store when sync finishes.
- On error (auth, rate limit, network): log, optionally set store status to `maintenance` or `error`.

**3.3 API**

- `POST /api/stores/:id/sync/products` — trigger product sync (async or sync; recommend async with job id).
- `POST /api/stores/:id/sync/orders`
- `POST /api/stores/:id/sync/customers`
- Optional: `POST /api/stores/:id/sync/all` (products + orders + customers).  
- All require auth and that the store belongs to the user.

**3.4 Client**

- Stores list: show “Last synced” from `lastSync`.  
- Per store: “Sync products”, “Sync orders”, “Sync customers” (or “Sync all”) that call the above endpoints.  
- Products/Orders/Customers list pages: already filtered by store; data comes from our DB (so after sync, they show real data). Optionally “Refresh” per store to trigger sync then refetch.

---

### Phase 4: Inventory (Shopify-Specific)

- In Shopify adapter, implement `fetchInventory` using InventoryItem + InventoryLevel.  
- Either:
  - Extend Product model with `inventoryByLocation` or a separate InventoryCache collection keyed by (storeId, productExternalId, locationId), or  
  - Derive “total available” per product and store in Product.stock.  
- `POST /api/stores/:id/sync/inventory` (Shopify only) or include in “Sync products” for Shopify.  
- WooCommerce: inventory already comes from product/variation in product sync.

---

### Phase 5: Future Platforms

- **BigCommerce / Magento / etc.:** Add `adapters/bigcommerce.js` (same interface: validate, fetchProducts, fetchOrders, fetchCustomers).  
- Register in `adapters/index.js`.  
- Add `platform` enum value and credential shape in Store model and client “Connect Store” form.  
- No change to sync service or core API beyond “get adapter by platform”.

---

## 5. File Structure (Target)

```
server/
├── adapters/
│   ├── index.js           # getAdapter(platform) ✅
│   ├── wooCommerce.js     # validateCredentials ✅ (fetch* in Phase 2)
│   └── shopify.js         # validateCredentials ✅ (fetch* in Phase 2)
├── services/
│   ├── syncService.js    # syncProducts(storeId), syncOrders(storeId), syncCustomers(storeId) — Phase 3
│   └── encryption.js     # encrypt / decrypt ✅
├── models/
│   └── Store.js          # + platform, credentialsEncrypted ✅
├── routes/
│   └── storeRoutes.js    # + POST /:id/sync/products|orders|customers — Phase 3
├── controllers/
│   └── storeController.js # create/update with validation + encryption ✅; sync triggers Phase 3
└── .env                  # STORE_CREDENTIALS_SECRET (optional; falls back to JWT_SECRET), WOOCOMMERCE_BYPASS_SSL (dev)
```

**Phase 1 done:** Store model (platform, credentialsEncrypted), encryption service, WooCommerce + Shopify adapters (validateCredentials), Connect Store API, client Connect Store modal (WooCommerce + Shopify).

**Phase 2 done:** WooCommerce and Shopify adapters implement `fetchProducts`, `fetchOrders`, `fetchCustomers` (pagination: page for WC, pageInfo cursor for Shopify). Product, Order, Customer models have `externalId` and unique index `(storeId, externalId)` for upserts.

**Phase 3 done:** `services/syncService.js` implements `syncProducts`, `syncCustomers`, `syncOrders`, `syncAll`. Store routes: `POST /api/stores/:id/sync/products`, `/sync/orders`, `/sync/customers`, `/sync/all`. Sync upserts by (storeId, externalId) and sets Store `lastSync`.

**Phase 4 done:** Shopify adapter implements `fetchInventory` (paginates products, collects variant `inventory_item_id`, batch-fetches `inventory_levels`, returns `productStock` map). `syncService.syncInventory(storeId, userId)` updates `Product.stock` and `Product.status` (in_stock/low_stock/out_of_stock). Route `POST /api/stores/:id/sync/inventory` (Shopify only; 400 for WooCommerce).

---

## 6. Security & Operations

- **Credentials:** Encrypt at rest; decrypt only in server memory when calling adapters.  
- **HTTPS:** All store URLs should use HTTPS in production; bypass only in dev with env flag.  
- **Rate limits:** Shopify 40/min; WooCommerce typically allows more. Implement backoff or queue if many stores.  
- **Scopes (Shopify):** Request minimal scopes (read_products, read_orders, read_customers, read_inventory if needed).  
- **WooCommerce keys:** Read/Write only if we need to push updates; for “retrieve only” start with Read.

---

## 7. Summary

| Phase | Scope | Outcome |
|-------|--------|---------|
| **1** | Store model + credentials (encrypted), validation, Connect Store API + client form (WooCommerce & Shopify) | Users can connect WC and Shopify stores; credentials validated and stored safely. |
| **2** | WooCommerce + Shopify adapters (products, orders, customers; Shopify inventory optional) | Server can fetch and normalize data from both platforms. |
| **3** | Sync service + sync API + “Sync” in client; Product/Order/Customer upsert from adapters | One-click sync per store; CRM data populated from external stores. |
| **4** | Shopify inventory sync and storage | Inventory visible for Shopify stores. |
| **5** | New platform (e.g. BigCommerce) | Same pattern: new adapter + enum + form. |

This plan allows you to **retrieve products, inventories, orders, and customers** from WooCommerce and Shopify today, and to add more store integrations later without redesigning the server or client.
