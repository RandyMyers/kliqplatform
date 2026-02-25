# Subscription & Payments Implementation Plan

## 1. Overview

This plan covers **free trial**, **subscription lifecycle**, **subscription plans** (multi-currency), and **payment methods**: **Stripe**, **Flutterwave**, and **bank transfer** (USD, EUR, GBP). API keys and secrets are stored encrypted; payment gateways are integrated via server-side APIs and webhooks.

**Reference docs (project root):** `stripe.txt` (Stripe API reference), `flutterwave.txt` (Flutterwave React/SDK and params). Stripe: use **Payment Links** (POST /v1/payment_links) so we generate a URL; user opens it and pays; we get `checkout.session.completed`. Flutterwave: **initialize payment** with tx_ref, amount, currency, customer, redirect_url; user pays; we rely on webhook for success.

---

## 2. Current State

- **User model** has: `plan` (free_trial | starter | pro | enterprise), `trialEndsAt`, `subscriptionStatus` (trialing | active | past_due | cancelled | null).
- **Signup** sets 14-day trial: `plan: 'free_trial'`, `trialEndsAt = now + 14 days`, `subscriptionStatus: 'trialing'`.
- **Billing API** exists: `GET /api/billing/plan`, `GET /api/billing/plans`, `GET /api/billing/history`, `PUT /api/billing/settings` (plan change is currently mock).
- **No** Subscription record, no payment provider integration, no encrypted gateway config.

---

## 3. Target Architecture

### 3.1 Free Trial

- **Duration:** 14 days from signup (configurable).
- **Behaviour:**
  - User can use the app until `trialEndsAt`. After that, if no paid subscription, access is restricted (middleware or front-end redirect to billing).
  - During trial, user can upgrade to a paid plan (Stripe/Flutterwave/bank transfer). On first successful payment, `subscriptionStatus` → `active`, `trialEndsAt` can be cleared or kept for display.
- **Expiry handling:**
  - Optional cron: mark users with `trialEndsAt < now` and no active subscription as `subscriptionStatus: 'expired'` or keep `trialing` and enforce “trial ended” in middleware.

### 3.2 Subscription Lifecycle

| Status      | Meaning |
|------------|--------|
| `trialing` | Free trial in progress. |
| `active`   | Paid subscription current (payment succeeded, period valid). |
| `past_due` | Payment failed or overdue; grace period or dunning. |
| `cancelled` | User or system cancelled; access until period end. |
| `expired`  | Trial or subscription ended; no access. |

- One **active** subscription per user (or one per account in multi-tenant). We use a **Subscription** document to store provider-specific ids (e.g. Stripe `subscription_id`, `customer_id`), current period end, and payment method type.

### 3.3 Subscription Plans (Multi-Currency)

Plans are defined with pricing in **USD**, **EUR**, **GBP** so that:
- Stripe/Flutterwave can charge in the chosen currency.
- Bank transfer shows the correct amount and bank details per currency.

Suggested structure (in code or DB):

```js
{
  id: 'starter',
  name: 'Starter',
  slug: 'starter',
  description: 'Up to 2 stores, basic analytics',
  limits: { stores: 2 },
  features: ['Up to 2 stores', 'Basic analytics'],
  prices: {
    USD: { amount: 2900, currency: 'USD' },   // 29.00
    EUR: { amount: 2700, currency: 'EUR' },   // 27.00
    GBP: { amount: 2500, currency: 'GBP' },   // 25.00
  },
  interval: 'month',  // or 'year'
  stripePriceId: { USD: 'price_xxx', EUR: 'price_yyy', GBP: 'price_zzz' },  // optional
  flutterwavePlanId: 'xxx',  // optional
}
```

- Amounts in **minor units** (cents) for Stripe/Flutterwave.
- Bank transfer: display amount in major units (e.g. 29.00 USD) and show bank account details for that currency.

### 3.4 Plans & Subscriptions: We Handle Them (Not the Gateways)

- **Plans** (starter, pro, enterprise) and **subscription state** (current period, status, renewal) are managed entirely on **our server** (Subscription model, User.plan, config/plans.js).
- We do **not** use Stripe Subscriptions or Flutterwave recurring products. We use the gateways only to **collect one-time payments** (e.g. one month’s fee). When a payment succeeds (webhook), we create/update our Subscription and set the period (e.g. current period end = now + 1 month).
- Renewal can be implemented later (e.g. cron that creates a new payment link when a subscription is near expiry, or we send the user to the billing page to pay again).

### 3.5 Payment Methods Summary

| Method         | How it works | API keys / storage |
|----------------|--------------|--------------------|
| **Stripe**     | **Payment Links API**: we create a payment link (one URL per request) with line_items (amount from plan/currency); user navigates to that link and pays. Stripe hosts the page; we receive `checkout.session.completed` (payment links create checkout sessions). Alternatively we could use **Invoices** (create draft → finalize → `hosted_invoice_url`). | Secret key + webhook signing secret (encrypted or env). |
| **Flutterwave**| **Initialize payment** (POST to Flutterwave API: tx_ref, amount, currency, customer, redirect_url); we get back a payment link or redirect URL. User pays; webhook confirms success. We then update our Subscription. | Secret key (and optional public key) encrypted or env. |
| **Bank transfer** | No gateway. We define bank details per currency (USD/EUR/GBP). User pays manually; uploads proof; admin verifies and we activate subscription. | No payment API keys. Bank details in config. |

---

## 4. Data Models

### 4.1 Subscription (new)

```javascript
// models/Subscription.js
{
  userId: ObjectId, ref: 'User', required, unique,  // one active subscription per user
  plan: String, required,  // starter | pro | enterprise
  status: String, enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired'], default: 'active',
  currency: String,  // USD | EUR | GBP
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: Boolean, default: false,
  // Provider-specific (Stripe)
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  stripePriceId: String,
  // Provider-specific (Flutterwave)
  flutterwaveSubscriptionId: String,
  flutterwaveCustomerId: String,
  // Bank transfer
  paymentMethod: String, enum: ['stripe', 'flutterwave', 'bank_transfer'],
  bankTransferProofUrl: String,  // if bank transfer: upload proof
  bankTransferVerifiedAt: Date,
  createdAt: Date,
  updatedAt: Date,
}
```

- When user is on **free trial only**, we may still have no Subscription document, and rely on `User.trialEndsAt` and `User.subscriptionStatus === 'trialing'`. When they first pay, we create a Subscription and set User’s plan/status.
- For **Stripe/Flutterwave**, we create/update Subscription from webhooks and link `stripeSubscriptionId` / `flutterwaveSubscriptionId`.

### 4.2 PaymentGatewayConfig (new) – Encrypted API Keys

Store gateway credentials encrypted at rest (reuse pattern from `services/encryption.js`; consider a dedicated salt/key for payment keys).

```javascript
// models/PaymentGatewayConfig.js  (or single doc in a Config collection)
{
  gateway: String, required, unique,  // 'stripe' | 'flutterwave'
  encryptedCredentials: String,  // JSON encrypted: see below
  isLive: Boolean, default: false,  // false = test keys
  updatedAt: Date,
}
```

**Encrypted payload examples:**

- **Stripe:** `{ secretKey: 'sk_...', webhookSecret: 'whsec_...' }`
- **Flutterwave:** `{ secretKey: 'FLWSECK...', publicKey: 'FLWPUBK...' }`

**Bank transfer** does not need API keys; use a separate **BankAccount** (or config) model:

```javascript
// models/BankAccount.js  (for bank transfer display)
{
  currency: String, required, unique,  // USD | EUR | GBP
  accountName: String,
  accountNumber: String,
  bankName: String,
  iban: String,
  swiftBic: String,
  reference: String,  // e.g. "StoreHub - User ID"
  instructions: String,  // optional text for user
  active: Boolean, default: true,
}
```

Only admins create/update BankAccount and PaymentGatewayConfig; never expose raw credentials to the client.

### 4.3 Payment / Invoice (optional but recommended)

For history and reconciliation:

```javascript
// models/Payment.js
{
  userId: ObjectId, ref: 'User',
  subscriptionId: ObjectId, ref: 'Subscription',
  amount: Number,  // minor units
  currency: String,
  status: String,  // succeeded | pending | failed | refunded
  paymentMethod: String,  // stripe | flutterwave | bank_transfer
  externalId: String,  // Stripe payment_intent id, Flutterwave tx ref, etc.
  paidAt: Date,
  metadata: Mixed,
  createdAt: Date,
}
```

---

## 5. Environment Variables

- **Stripe (global fallback):**  
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` (for client if needed).
- **Flutterwave (global fallback):**  
  `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_PUBLIC_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`.
- **Encryption:**  
  Use existing `STORE_CREDENTIALS_SECRET` or a dedicated `PAYMENT_CREDENTIALS_SECRET` for encrypting PaymentGatewayConfig and sensitive bank fields if stored in DB.
- **App URL:**  
  `FRONTEND_URL` (for redirects after checkout); `BASE_URL` for webhook URLs.

---

## 6. Implementation Phases

### Phase 1: Plans, Config & Subscription Model

1. **Subscription plans (multi-currency)**  
   - Define plans (starter, pro, enterprise) with `prices.USD`, `prices.EUR`, `prices.GBP` (amounts in minor units).  
   - Expose `GET /api/billing/plans` with full pricing and limits.

2. **Models**  
   - Add **Subscription** model (fields above).  
   - Add **PaymentGatewayConfig** model (gateway, encryptedCredentials, isLive).  
   - Add **BankAccount** model for USD/EUR/GBP bank details.  
   - Optionally add **Payment** model for history.

3. **Encryption for payment keys**  
   - Reuse or extend `services/encryption.js` with a dedicated salt/key for payment credentials (e.g. `PAYMENT_CREDENTIALS_SECRET`).  
   - Helpers: `encryptPaymentCreds(plain)`, `decryptPaymentCreds(cipher)`.

4. **Admin / config API (protected, admin-only)**  
   - `GET/PUT /api/admin/payment-config` – get/update Stripe and Flutterwave encrypted credentials (and bank accounts).  
   - Or separate: `GET/PUT /api/admin/payment-config/stripe`, `.../flutterwave`, `GET/PUT /api/admin/bank-accounts`.

5. **Billing API updates**  
   - `GET /api/billing/plan`: include Subscription if exists (current period, payment method, status).  
   - `GET /api/billing/plans`: return plans with multi-currency prices.  
   - Trial: keep using `User.trialEndsAt` and `User.subscriptionStatus === 'trialing'` until first payment; then create Subscription and set User plan/status from Subscription.

---

### Phase 2: Stripe Integration (Payment Links)

1. **Credentials**  
   - Store Stripe secret key (and webhook secret) in PaymentGatewayConfig (encrypted) or in env.  
   - Use existing or new encryption helper when reading.

2. **Payment link**  
   - `POST /api/billing/create-checkout-session` (or rename to `create-payment-link`)  
     - Body: `{ planId, currency }`.  
     - Use **Payment Links API** (see stripe.txt): `POST /v1/payment_links` with `line_items` (use `price_data` for dynamic amount: currency, unit_amount, product_data.name), `metadata` (userId, planId, currency), `after_completion` redirect to FRONTEND_URL/billing.  
     - Return `{ url: paymentLink.url }` so the client can send the user to that URL to pay. When the user opens the link, Stripe creates a Checkout Session; we still receive `checkout.session.completed`.

3. **Customer Portal (optional)**  
   - `POST /api/billing/create-portal-session`  
     - Only if we have a Stripe Customer ID (e.g. after at least one payment). Create Billing Portal session; return portal URL.

4. **Webhooks**  
   - `POST /api/webhooks/stripe` (raw body).  
     - Verify signature. Handle: `checkout.session.completed` (payment completed via payment link or checkout), `invoice.paid`, `invoice.payment_failed` if we ever use Invoices.  
     - On paid: create/update our Subscription (we own the subscription; no Stripe subscription), set User.plan and subscriptionStatus, create Payment record.

5. **Payment history**  
   - `GET /api/billing/history`: from our Payment records (and trial start).

---

### Phase 3: Flutterwave Integration

1. **Credentials**  
   - Store Flutterwave secret (and public key, webhook hash) in PaymentGatewayConfig (encrypted) or env.

2. **Payment initiation**  
   - `POST /api/billing/create-flutterwave-payment`  
     - Body: `{ planId, currency }`.  
     - Create a Flutterwave payment link or transaction with amount from plan in that currency.  
     - Return payment link or transaction data for client redirect.

3. **Webhooks**  
   - `POST /api/webhooks/flutterwave`  
     - Verify payload (Flutterwave webhook hash).  
     - On successful payment: create/update Subscription, set User plan and subscriptionStatus, create Payment record.

4. **Payment history**  
   - Ensure Flutterwave payments are stored in Payment and shown in `GET /api/billing/history`.

---

### Phase 4: Bank Transfer (USD, EUR, GBP)

1. **No gateway API keys**  
   - Only bank account details per currency.

2. **Bank account config**  
   - Admin sets BankAccount documents for USD, EUR, GBP (account name, number, bank name, IBAN, SWIFT, reference, instructions).  
   - Optionally encrypt sensitive fields or restrict to admin.

3. **Client flow**  
   - `GET /api/billing/bank-details?currency=USD` (or EUR, GBP): return account details and amount to pay (from plan price in that currency).  
   - `POST /api/billing/bank-transfer-request`  
     - Body: `{ planId, currency }`.  
     - Create a Subscription in `pending` or similar; create Payment with status `pending`.  
     - Return bank details + unique reference (e.g. “StoreHub-{userId}-{timestamp}”) for user to put on transfer.

4. **Proof upload**  
   - `POST /api/billing/bank-transfer-proof`  
     - Body: form-data with file (image/PDF).  
     - Upload to Cloudinary or storage; save URL on Payment or Subscription.  
     - Status stays “pending” until admin verifies.

5. **Admin verification**  
   - `PUT /api/admin/payments/:id/verify` (admin only): set Payment as succeeded, activate Subscription, set User plan and subscriptionStatus to active.

---

### Phase 5: Free Trial Enforcement & Middleware ✅ DONE

1. **Trial expiry**  
   - Implemented: `checkAccess(user)` in `services/subscriptionAccess.js` treats user as no access when `trialEndsAt < now` and no active Subscription; when detected, lazily sets `User.subscriptionStatus = 'expired'`. No separate cron required.

2. **Plan limits**  
   - Middleware or store controller: when creating stores, check User’s plan limits Implemented: in store controller create we call checkAccess and checkStoreLimit; 403 if not allowed. See Phase 5 status in §9.

3. **Billing page**  
   - Client shows: current plan, trial end (if trialing), upgrade options with currency selector, Stripe/Flutterwave/bank transfer choice, and bank details + upload proof for bank transfer.

---

## 7. File Structure (Target)

```
server/
├── models/
│   ├── Subscription.js
│   ├── Payment.js
│   ├── PaymentGatewayConfig.js
│   └── BankAccount.js
├── routes/
│   ├── billingRoutes.js      (extend: checkout, portal, bank-details, bank-transfer-request, bank-transfer-proof)
│   └── webhookRoutes.js     (or stripeWebhook, flutterwaveWebhook in billing)
├── controllers/
│   ├── billingController.js (extend)
│   └── adminController.js   (optional: payment config, bank accounts, verify bank payment)
├── services/
│   ├── encryption.js        (existing; optional payment-specific helpers)
│   ├── stripeService.js     (create checkout session, portal, parse webhooks)
│   ├── flutterwaveService.js
│   └── planService.js       (get plan by id, get price in currency)
├── config/
│   └── plans.js             (or DB) – plan definitions with multi-currency prices
└── middleware/
    └── requireSubscription.js  (optional: check active/trialing)
```

---

## 8. Security Checklist

- [ ] Stripe/Flutterwave secret keys only in env or encrypted in DB; never in client or logs.
- [ ] Webhook endpoints verify signatures (Stripe signing secret, Flutterwave hash).
- [ ] Bank account and payment config changes restricted to admin role.
- [ ] Payment and Subscription documents scoped by userId where applicable.
- [ ] Use HTTPS and env-based URLs for webhooks and redirects.

---

## 9. Summary Table

| Phase | Scope | Outcome |
|-------|--------|--------|
| **1** | Plans (multi-currency), Subscription & config models, encrypted gateway config, admin config API | Plans with USD/EUR/GBP; DB ready for subscriptions and keys. **✅ Implemented** |
| **2** | Stripe: checkout, portal, webhooks | Users can pay with Stripe; subscriptions and history updated. **✅ Implemented** |
| **3** | Flutterwave: payment link, webhooks | Users can pay with Flutterwave. **✅ Implemented** |
| **4** | Bank transfer: bank details, proof upload, admin verify | Users can request bank transfer (USD/EUR/GBP) and upload proof; admin activates. **✅ Implemented** |
| **5** | Trial expiry, plan limits, middleware | Enforce trial and limits across the app. **✅ Implemented** |

---

## 10. Implementation Status (Current)

**Phase 1 done:**
- `config/plans.js` – plans with `prices.USD/EUR/GBP` (minor units), `getPlanById`, `getPriceForPlan`, `getPaidPlans`.
- Models: `Subscription`, `Payment`, `PaymentGatewayConfig`, `BankAccount`.
- `services/paymentEncryption.js` – `encryptPaymentCreds`, `decryptPaymentCreds` (PAYMENT_CREDENTIALS_SECRET or fallback).
- Admin API (admin only): `GET/PUT /api/admin/payment-config`, `PUT /api/admin/payment-config/stripe`, `PUT /api/admin/payment-config/flutterwave`, `GET /api/admin/bank-accounts`, `PUT /api/admin/bank-accounts`, `GET /api/admin/payments/pending`, `PUT /api/admin/payments/:id/verify`.
- Billing API: `GET /api/billing/plan` (includes Subscription), `GET /api/billing/plans` (from config), `GET /api/billing/history` (from Payment), `GET /api/billing/bank-details?currency=`, `POST /api/billing/bank-transfer-request`, `POST /api/billing/bank-transfer-proof` (file upload to Cloudinary).

**Phase 4 (bank transfer) done:**
- User requests bank transfer with planId + currency → Payment (pending) created, reference and bank details returned.
- User uploads proof (image/PDF) → stored in Cloudinary, URL saved on Payment and Subscription.
- Admin verifies via `PUT /api/admin/payments/:id/verify` → Payment succeeded, Subscription created/updated, User plan and subscriptionStatus set.

**Phase 2 (Stripe) done:**
- We use **Payment Links API** (stripe.txt): create a payment link per request with line_items (price_data), metadata (userId, planId, currency), after_completion redirect. User opens the link and pays; we get `checkout.session.completed`.
- `services/stripeService.js`: getStripe(), getWebhookSecret(), createPaymentLink(), createCheckoutSession (alias), createPortalSession, constructWebhookEvent.
- Billing: `POST /api/billing/create-checkout-session` (body: planId, currency) returns payment link url.
- `POST /api/webhooks/stripe`: handles checkout.session.completed; creates/updates our Subscription and Payment, updates User. Plans/subscriptions managed on our server only.
- Env fallback: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.

**Phase 3 (Flutterwave) done:**
- `services/flutterwaveService.js`: getCredentials() (env or PaymentGatewayConfig), initializePayment() (POST to Flutterwave v3/payments with tx_ref, amount, currency, customer, redirect_url, meta.userId/planId/currency), verifyWebhookPayload(), getWebhookSecretHash().
- Billing: `POST /api/billing/create-flutterwave-payment` (body: planId, currency) returns { url, txRef, amount, currency }.
- `POST /api/webhooks/flutterwave` (JSON body): on charge.completed / status successful, create/update Subscription and Payment, update User. Plans managed on our server.
- Reference: flutterwave.txt (tx_ref, amount, currency, customer, redirect_url).

**Phase 5 (trial & plan limits) done:**
- `services/subscriptionAccess.js`: `hasActiveAccess(user, subscription)`, `checkAccess(user)` (async; lazy-sets User.subscriptionStatus to `expired` when trial ended and no active subscription), `checkStoreLimit(userId, planId)`.
- `middleware/requireSubscription.js`: use after auth; returns 403 with `SUBSCRIPTION_REQUIRED` if access not allowed.
- Store create: before creating a store, `checkAccess(req.user)` and `checkStoreLimit(req.user._id, req.user.plan)`; 403 with clear message if trial/expired or store limit reached. Plan limits from `config/plans.js` (e.g. free_trial: 1 store, starter: 2, pro: 10, enterprise: -1).

This plan gives a full path from **free trial** → **subscription**, **plans in USD/EUR/GBP**, and **three payment methods** (Stripe, Flutterwave, bank transfer) with **secure storage and use of API keys** and clear steps to implement each part.
