# Server Implementation Plan

## 1. Current State Analysis

### 1.1 Existing Files
- `server/app.js` – Express app with MongoDB, CORS, file upload, Cloudinary
- `server/package.json` – Dependencies present
- `server/.env` – MongoDB, JWT, SMTP, Exchange Rate API, WooCommerce SSL bypass, Cloudinary, Store credentials secret
- `server/adapters/` – WooCommerce & Shopify adapters (validateCredentials); see **STORE-INTEGRATIONS-IMPLEMENTATION-PLAN.md**
- Reference APIs: `server/shopify.txt`, `server/woocommerce.txt` (primary store integrations)

### 1.2 Frontend Features Requiring Backend (Client Pages)

All client dashboard and landing pages expect the following server capabilities:

| Feature area | Client page(s) | API / behaviour expected |
|--------------|----------------|---------------------------|
| **Auth** | Login, Signup | POST /api/auth/login, signup; JWT; GET /me; forgot-password |
| **Contact** | landing/Contact.js | POST /api/contact (email to CONTACT_RECEIVER) |
| **Stores** | Stores.js | CRUD stores, stats, groups; **platform (WooCommerce/Shopify)**; connect + sync (see store integrations) |
| **Product management** | Products.js, ProductDetails.js | CRUD products; filter by store; stats; image upload (Cloudinary); bulk/csv if needed |
| **Order management** | Orders.js, OrderDetails.js | List/filter orders; order details; update status; stats; revenue |
| **Customer management** | Customers.js, CustomerOrderHistory.js | List customers; customer details; order history per customer; stats |
| **User management** | Users.js | CRUD users; roles (admin/manager/user); invite/disable |
| **Tasks** | Tasks.js | CRUD tasks; status/priority/due/assignee; task stats |
| **Marketing** | Coupons.js | CRUD coupons; code, type (percent/fixed), validity, usage limit, store scope |
| **Analytics** | Analytics.js, dashboard widgets | Overview metrics; sales over time; orders over time; store/product breakdowns |
| **Billing & subscriptions** | Billing.js | Current plan; **free trial**; payment history; billing settings (see §1.4) |
| **Support** | Support.js | List/create/update tickets; knowledge base (static or API); forum (optional) |
| **Conversations** | Conversations.js | Chat/messages (optional: websockets or REST; can be placeholder) |
| **Extensions** | Extensions.js | Extension catalog (static JSON or minimal API) |

### 1.3 Store Integrations (Shopify & WooCommerce)

- **Primary integrations:** WooCommerce and Shopify (see `shopify.txt`, `woocommerce.txt` for API details).
- **Full plan:** See **STORE-INTEGRATIONS-IMPLEMENTATION-PLAN.md** for:
  - Store model: `platform`, encrypted credentials, validation per platform
  - Adapters: validateCredentials (done); fetchProducts, fetchOrders, fetchCustomers (Phase 2); sync service (Phase 3); Shopify inventory (Phase 4)
- **Server status:** Phases 1–4 done (Store + credentials, adapters fetch/sync, sync API, Shopify inventory). See that document for details.

### 1.4 Subscriptions and Free Trial

- **Plans:** e.g. Free Trial, Starter, Pro, Enterprise (names and limits TBD; stored as static config or in DB).
- **Free trial:** Time-limited access (e.g. 14 days) after signup; no payment required until trial ends.
- **Behaviour:**
  - On signup: set `trialEndsAt` (e.g. now + 14 days); plan = `free_trial` or `trial`.
  - Middleware or helper: if `trialEndsAt` in past and no paid subscription, treat as expired (optional feature gating or redirect to billing).
  - Billing API: return current plan, trial end date, payment history (mock or Stripe later).
- **Data:** Extend **User** with `trialEndsAt` (Date), `plan` (String), optional `subscriptionId` / `customerId` for payment provider; or add a **Subscription** model (userId, plan, status, trialEndsAt, currentPeriodEnd, etc.).
- **Full implementation (Stripe, Flutterwave, bank transfer, plans, encrypted API keys):** See **SUBSCRIPTION-AND-PAYMENTS-IMPLEMENTATION-PLAN.md**.

---

## 2. Database Models (MongoDB/Mongoose)

### 2.1 Core Models

```javascript
// models/User.js
{
  fullName: String,
  email: String (unique),
  password: String (hashed),
  role: String (admin|manager|user),
  avatar: String,
  createdAt: Date,
  updatedAt: Date
}

// models/Store.js
{
  name: String,
  url: String,
  status: String (online|offline|maintenance),
  admin: String,
  location: String,
  userId: ObjectId (ref: User),
  woocommerceKeys: { consumerKey, consumerSecret },
  createdAt: Date,
  updatedAt: Date
}

// models/StoreGroup.js
{
  name: String,
  storeIds: [ObjectId],
  userId: ObjectId,
  createdAt: Date,
  updatedAt: Date
}

// models/Product.js
{
  name: String,
  sku: String,
  price: Number,
  stock: Number,
  status: String (in_stock|low_stock|out_of_stock),
  storeId: ObjectId,
  category: String,
  image: String (Cloudinary URL),
  description: String,
  createdAt: Date,
  updatedAt: Date
}

// models/Order.js
{
  orderId: String (WC-xxxx),
  date: Date,
  customerId: ObjectId,
  storeId: ObjectId,
  total: Number,
  status: String (processing|pending|completed|cancelled),
  payment: String (paid|pending),
  items: Number,
  lineItems: [Object],
  createdAt: Date,
  updatedAt: Date
}

// models/Customer.js
{
  name: String,
  email: String,
  phone: String,
  location: String,
  storeId: ObjectId,
  orders: Number,
  totalSpent: Number,
  lastOrder: Date,
  tags: [String],
  status: String,
  createdAt: Date,
  updatedAt: Date
}

// models/Task.js
{
  title: String,
  description: String,
  status: String (todo|in-progress|completed),
  priority: String (low|medium|high),
  dueDate: Date,
  assigneeId: ObjectId,
  tags: [String],
  userId: ObjectId,
  createdAt: Date,
  updatedAt: Date
}

// models/ContactSubmission.js
{
  name: String,
  email: String,
  company: String,
  message: String,
  createdAt: Date
}

// models/SupportTicket.js
{
  subject: String,
  message: String,
  userId: ObjectId,
  status: String (open|in-progress|resolved),
  createdAt: Date,
  updatedAt: Date
}

// models/Coupon.js
{
  code: String,
  discountType: String (percent|fixed),
  discountValue: Number,
  validFrom: Date,
  validTo: Date,
  usageLimit: Number,
  usedCount: Number,
  storeId: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 3. API Endpoints

### 3.1 Auth (`/api/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | /login | Login, return JWT |
| POST | /signup | Register user |
| POST | /logout | Invalidate token (optional) |
| GET | /me | Get current user (protected) |
| POST | /forgot-password | Send reset email |

### 3.2 Users (`/api/users`)
| Method | Path | Description |
|--------|------|-------------|
| GET | / | List users (protected) |
| GET | /:id | Get user (protected) |
| POST | / | Create user (protected) |
| PUT | /:id | Update user (protected) |
| DELETE | /:id | Delete user (protected) |

### 3.3 Contact (`/api/contact`)
| Method | Path | Description |
|--------|------|-------------|
| POST | / | Submit contact form, send email to CONTACT_RECEIVER |

### 3.4 Stores (`/api/stores`)
| Method | Path | Description |
|--------|------|-------------|
| GET | / | List stores (protected) |
| GET | /stats | Overview stats (protected) |
| GET | /:id | Get store (protected) |
| POST | / | Create store (protected) |
| PUT | /:id | Update store (protected) |
| DELETE | /:id | Delete store (protected) |
| GET | /groups | List store groups (protected) |
| POST | /groups | Create group (protected) |

### 3.5 Products (`/api/products`)
| Method | Path | Description |
|--------|------|-------------|
| GET | / | List products, filter by store (protected) |
| GET | /stats | Product stats (protected) |
| GET | /:id | Get product (protected) |
| POST | / | Create product, upload image to Cloudinary (protected) |
| PUT | /:id | Update product (protected) |
| DELETE | /:id | Delete product (protected) |
| POST | /upload | Upload product image (protected) |

### 3.6 Orders (`/api/orders`)
| Method | Path | Description |
|--------|------|-------------|
| GET | / | List orders (protected) |
| GET | /stats | Order stats (protected) |
| GET | /:id | Get order details (protected) |
| PUT | /:id/status | Update order status (protected) |

### 3.7 Customers (`/api/customers`)
| Method | Path | Description |
|--------|------|-------------|
| GET | / | List customers (protected) |
| GET | /stats | Customer stats (protected) |
| GET | /:id | Get customer (protected) |
| GET | /:id/orders | Customer order history (protected) |

### 3.8 Tasks (`/api/tasks`)
| Method | Path | Description |
|--------|------|-------------|
| GET | / | List tasks (protected) |
| GET | /stats | Task stats (protected) |
| GET | /:id | Get task (protected) |
| POST | / | Create task (protected) |
| PUT | /:id | Update task (protected) |
| DELETE | /:id | Delete task (protected) |

### 3.9 Analytics (`/api/analytics`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /overview | Dashboard metrics (protected) |
| GET | /sales | Sales chart data (protected) |
| GET | /orders | Orders chart data (protected) |

### 3.10 Billing (`/api/billing`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /plan | Current plan (protected) |
| GET | /history | Payment history (protected) |
| PUT | /settings | Billing settings (protected) |

### 3.11 Support (`/api/support`)
| Method | Path | Description |
|--------|------|-------------|
| GET | /tickets | List tickets (protected) |
| POST | /tickets | Create ticket (protected) |
| GET | /tickets/:id | Get ticket (protected) |
| PUT | /tickets/:id | Update ticket (protected) |

### 3.12 Coupons (`/api/coupons`)
| Method | Path | Description |
|--------|------|-------------|
| GET | / | List coupons (protected) |
| POST | / | Create coupon (protected) |
| PUT | /:id | Update coupon (protected) |
| DELETE | /:id | Delete coupon (protected) |

### 3.13 Extensions (`/api/extensions`)
| Method | Path | Description |
|--------|------|-------------|
| GET | / | List extension catalog – static (protected) |

### 3.14 Conversations (`/api/conversations`)
| Method | Path | Description |
|--------|------|-------------|
| GET | / | List conversations (protected) |
| POST | / | Create conversation (protected) |
| GET | /:id | Get conversation (protected) |
| POST | /:id/messages | Add message (protected) |
| PUT | /:id/status | Update status open/closed (protected) |

### 3.15 Auth – additional
| Method | Path | Description |
|--------|------|-------------|
| POST | /forgot-password | Send password reset email |
| POST | /reset-password | Set new password with token |

---

## 4. Implementation Phases

### Phase 1: Foundation (Critical – app.js won't start without these)
1. **Dependencies** – Add to package.json: express, mongoose, cors, body-parser, dotenv, morgan, express-fileupload, cloudinary, jsonwebtoken, bcryptjs
2. **Config** – Create `config/cloudinary.js` (from .env)
3. **Helper stub** – Create `helper/receiverEvent.js` (minimal stub that exports `scheduleEmailSync`)
4. **Swagger stub** – Create `swagger/index.js` (minimal or disable in app.js)
5. **Auth routes** – Login, signup, JWT middleware
6. **User routes** – Basic CRUD
7. **Contact route** – POST /api/contact (nodemailer to CONTACT_RECEIVER)

### Phase 2: Core CRM ✅ DONE
1. **Models** – User, Store, StoreGroup, Product, Order, Customer, Task, ContactSubmission
2. **Stores API** – Full CRUD + stats + groups (`/api/stores`)
3. **Products API** – Full CRUD (`/api/products`)
4. **Orders API** – List, details, stats, update status (`/api/orders`)
5. **Customers API** – List, details, order history (`/api/customers`)
6. **Tasks API** – Full CRUD + stats (`/api/tasks`)

### Phase 3: Analytics & Billing ✅ DONE
1. **Analytics API** – Overview metrics, sales/orders chart data (aggregations from Order, Product, Customer); `/api/analytics/overview`, `/sales`, `/orders`
2. **Billing API** – Current plan, free trial (trialEndsAt on User), payment history (mock), billing settings; `/api/billing/plan`, `/plans`, `/history`, `PUT /settings`; User model extended with `plan`, `trialEndsAt`, `subscriptionStatus`; signup sets 14-day trial

### Phase 4: Support & Extras ✅ DONE
1. **Support API** – SupportTicket model; list/create/get/update tickets (`/api/support/tickets`)
2. **Coupons API** – Coupon model; CRUD coupons (`/api/coupons`); code, discountType (percent/fixed), validity, storeId, userId
3. **rateSyncService** – Exchange rate sync (already referenced)
4. **receiverEvent** – Full email sync if needed

### Phase 5: Extensions & Conversations ✅ DONE
1. **Extensions API** – GET /api/extensions returns static catalog (protected).
2. **Conversations API** – Conversation model (userId, subject, contactName, contactEmail, status, messages[]); list, create, get, add message, update status (`/api/conversations`).

### Remaining implementation (from what we have so far)

| Item | Status |
|------|--------|
| Analytics routes + controller | Done |
| Billing routes + controller; User trial/plan fields | Done |
| SupportTicket model + support routes + controller | Done |
| Coupon model + coupon routes + controller | Done |
| Register analytics, billing, support, coupon routes in app.js | Done |
| Store integrations Phase 2–4 (sync, inventory) | Done (see STORE-INTEGRATIONS-IMPLEMENTATION-PLAN.md) |
| Auth forgot-password / reset-password | Done |
| Extensions API | Done |
| Conversations API (model + routes + controller) | Done |
| Rate limiting (auth, contact) | Done |
| Input validation (express-validator: auth, contact) | Done |

---

## 5. Security Checklist

- [x] JWT secret in .env, never committed (documented; ensure .env in .gitignore)
- [x] Password hashing with bcrypt (min 10 rounds) — authController uses bcrypt 10 rounds
- [x] Protected routes: verify JWT, attach user to req — authMiddleware in place
- [x] Input validation (express-validator) — auth (login, signup, forgot-password, reset-password) and contact; validators in `validators/`, `middleware/validate.js` for handleValidation
- [x] Rate limiting on auth and contact endpoints — `middleware/rateLimit.js`: authLimiter (10/15min), contactLimiter (5/15min); applied in app.js
- [x] CORS allowlist (already in app.js)
- [x] Sanitize file uploads (Cloudinary handles)
- [x] MongoDB injection prevention (Mongoose)

---

## 6. Environment Variables Required

```
MONGO_URL              ✓ (exists)
JWT_SECRET             ✓ (exists)
PORT                   ✓ (exists)
CONTACT_RECEIVER       ✓ (exists)
SMTP_HOST, SMTP_PORT   ✓ (exists)
SMTP_USER, SMTP_PASS   ✓ (exists)
SMTP_FROM              ✓ (exists)
CLOUDINARY_CLOUD_NAME  (optional - for product images)
CLOUDINARY_API_KEY     (optional)
CLOUDINARY_API_SECRET  (optional)
```

---

## 7. Client Integration Notes

- **Base URL**: `http://localhost:8800` (add to client env)
- **Auth**: Store JWT in localStorage or httpOnly cookie; send `Authorization: Bearer <token>` header
- **Contact form**: Replace `setTimeout` in Contact.js with `fetch('POST /api/contact', { body: formData })`
- **Login/Signup**: Replace `setTimeout` with real API calls, store token, redirect
- **Dashboard pages**: Use React Query to fetch from `/api/stores`, `/api/products`, etc.

---

## 8. File Structure (Target)

```
server/
├── app.js
├── package.json
├── .env
├── config/
│   └── cloudinary.js
├── helper/
│   └── receiverEvent.js
├── middleware/
│   ├── auth.js
│   ├── rateLimit.js
│   ├── validate.js
│   └── requireSubscription.js
├── validators/
│   ├── authValidators.js
│   └── contactValidators.js
├── models/
│   ├── User.js
│   ├── Store.js
│   ├── StoreGroup.js
│   ├── Product.js
│   ├── Order.js
│   ├── Customer.js
│   ├── Task.js
│   ├── ContactSubmission.js
│   ├── SupportTicket.js
│   ├── Coupon.js
│   └── Conversation.js
├── routes/
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── contactRoutes.js
│   ├── storeRoutes.js
│   ├── productRoutes.js
│   ├── orderRoutes.js
│   ├── customerRoutes.js
│   ├── taskRoutes.js
│   ├── analyticsRoutes.js
│   ├── billingRoutes.js
│   ├── supportRoutes.js
│   ├── couponRoutes.js
│   ├── extensionsRoutes.js
│   └── conversationsRoutes.js
├── controllers/
│   └── (one per route file)
├── services/
│   ├── rateSyncService.js
│   └── emailService.js
└── swagger/
    └── index.js
```

---

*Last updated: Feb 2025 — Features aligned to client pages; store integrations (Shopify/WooCommerce) and subscriptions/free trial documented; remaining phases listed.*
