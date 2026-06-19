# Implementation Plan: TAILORSTAQ Multi-Tenant Tailoring Platform

## Overview

This plan breaks the TAILORSTAQ platform into incremental coding tasks for a Node.js/Express backend and Vue.js 3 frontend. Tasks are ordered so each step builds on the previous one, ending with full integration. The backend is implemented first (database → middleware → modules → workers), followed by the frontend (stores → views → routing), then integration wiring and property-based tests.

---

## Tasks

- [x] 1. Project scaffolding and database foundation
  - [x] 1.1 Initialise Node.js/Express project structure
    - Create `src/` directory tree matching the design's module structure (`config/`, `middleware/`, `modules/`, `queues/`, `db/`, `utils/`)
    - Add `package.json` with dependencies: `express`, `pg`, `redis`, `bullmq`, `jsonwebtoken`, `bcrypt`, `multer`, `pdfkit`, `nodemailer`, `fast-check`, `jest`, `supertest`
    - Configure ESLint and Prettier; add `.env.example` with all required environment variables
    - _Requirements: none (infrastructure)_

  - [x] 1.2 Write and run database migrations
    - Create SQL migration files in `src/db/migrations/` for all tables: `tenants`, `approval_requests`, `shops`, `subscriptions`, `users`, `email_verifications`, `products`, `orders`, `order_status_history`, `receipts`, `audit_logs`, `notification_failures`
    - Add `tenant_id UUID NOT NULL` columns to all tenant-scoped tables
    - Enable PostgreSQL Row-Level Security on `shops`, `products`, `orders`, `order_status_history`, `receipts` and create `tenant_isolation` RLS policies
    - Add indexes on `tenant_id` columns and `orders.reference`
    - _Requirements: 7.1, 7.5_

  - [x] 1.3 Implement database pool and Redis client configuration
    - Create `src/config/db.js` (pg Pool with `app.current_tenant_id` session variable support) and `src/config/redis.js`
    - Implement `queryTenant(sql, params, tenantId)` helper in `src/db/queries/base.js` that sets `SET LOCAL app.current_tenant_id` and appends `tenant_id` filter; throw if `tenantId` is missing
    - _Requirements: 7.2, 7.5_

- [x] 2. Authentication and JWT utilities
  - [x] 2.1 Implement JWT utilities and password hashing
    - Create `src/utils/jwt.js`: `signToken({ userId, role, tenantId })` with 24-hour expiry and `verifyToken(token)` that throws on expiry or invalid signature
    - Create `src/utils/password.js`: `hashPassword(plain)` and `verifyPassword(plain, hash)` using bcrypt (cost factor 12)
    - _Requirements: 8.2, 8.3_

  - [x] 2.2 Implement auth middleware
    - Create `src/middleware/auth.js`: extract `Bearer` token, call `verifyToken`, attach `req.user = { userId, role, tenantId }`; return `401 UNAUTHENTICATED` for missing/invalid tokens and `401 TOKEN_EXPIRED` for expired tokens
    - Create role-guard helpers: `requireRole(...roles)` returning `403 FORBIDDEN` when role does not match
    - _Requirements: 8.1, 8.3, 8.6, 8.7_

  - [x] 2.3 Implement tenant middleware
    - Create `src/middleware/tenant.js`: compare `req.user.tenantId` against the shop/resource's `tenant_id`; return `403 CROSS_TENANT_ACCESS` and write an `audit_logs` row (requesting tenant, target resource, UTC timestamp) on mismatch
    - _Requirements: 7.2, 7.3, 8.8_

  - [x] 2.4 Write property test for JWT expiry (Property 9)
    - **Property 9: JWT expiry enforcement**
    - **Validates: Requirements 8.3**
    - Tag: `// Feature: tailorstaq-platform, Property 9: JWT expiry enforcement`
    - File: `tests/pbt/jwt-expiry.test.js`
    - Use `fast-check` arbitraries for random token ages relative to `exp`; assert that any token with `exp < Date.now()/1000` is rejected with an auth error

  - [x] 2.5 Write property test for account lockout (Property 8)
    - **Property 8: Account lockout after failed attempts**
    - **Validates: Requirements 8.5**
    - Tag: `// Feature: tailorstaq-platform, Property 8: Account lockout after failed attempts`
    - File: `tests/pbt/account-lockout.test.js`
    - Generate random sequences of failed/successful login attempts; assert account locks after exactly 5 consecutive failures and unlocks after 15 minutes

- [x] 3. Auth module — login, registration, lockout
  - [x] 3.1 Implement login endpoint with lockout logic
    - Create `src/modules/auth/auth.routes.js` and `auth.service.js`
    - `POST /api/v1/auth/login`: validate credentials, check `account_status`, increment `failed_attempts` on failure, reset on success, lock account + enqueue lockout notification email after 5 failures, issue JWT on success
    - _Requirements: 8.2, 8.4, 8.5_

  - [x] 3.2 Implement customer registration and email verification
    - `POST /api/v1/auth/register/customer`: validate full name, email uniqueness, password strength; create user with `account_status = 'pending_verification'`; generate 24-hour email verification token; enqueue verification email
    - `POST /api/v1/auth/verify-email`: look up token, check `used = false` and `expires_at > now()`; activate account; mark token used
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 3.3 Write property test for email verification token expiry (Property 7)
    - **Property 7: Email verification token expiry**
    - **Validates: Requirements 4.4**
    - Tag: `// Feature: tailorstaq-platform, Property 7: Email verification token expiry`
    - File: `tests/pbt/email-token-expiry.test.js`
    - Generate random token ages; assert token accepted only when `used = false` AND `expires_at > now()`

  - [x] 3.4 Write unit tests for auth module
    - Test password strength validation boundary values
    - Test JWT claim structure (sub, role, tenantId, exp ≤ iat + 86400)
    - Test lockout counter increment and reset
    - _Requirements: 8.2, 8.4, 8.5_

- [x] 4. Tenant registration, approval, and shop provisioning
  - [x] 4.1 Implement tenant registration endpoint
    - Create `src/modules/tenants/tenants.routes.js` and `tenants.service.js`
    - `POST /api/v1/tenants/register`: validate business name, contact email uniqueness across `approval_requests` and `tenants`, phone, description; create `approval_requests` row with `status = 'pending'`; enqueue confirmation email
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 4.2 Implement Platform_Admin approval endpoints
    - Create `src/modules/admin/admin.routes.js` and `admin.service.js`
    - `GET /api/v1/admin/approvals`: list approval requests with optional `?status=` filter; require `platform_admin` role
    - `PATCH /api/v1/admin/approvals/:id`: approve (create tenant + user + shop + free subscription, enqueue approval email) or reject (record rejection reason 1–500 chars, enqueue rejection email); require `platform_admin` role
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 4.3 Write unit tests for tenant approval state machine
    - Test `pending → approved` creates tenant, shop, and free subscription atomically
    - Test `pending → rejected` records rejection reason and does not create tenant
    - Test double-approve/reject returns appropriate error
    - _Requirements: 1.4, 1.5, 1.6_

- [x] 5. Shop setup and file upload
  - [x] 5.1 Implement Multer upload middleware and image validation
    - Create `src/middleware/upload.js`: configure Multer with `limits.fileSize = 5 * 1024 * 1024`; `fileFilter` rejects MIME types outside `image/png`, `image/jpeg`, `image/svg+xml`; post-upload check rejects zero-byte files; return distinct `VALIDATION_ERROR` messages per failure type
    - Implement S3/object-store upload helper in `src/utils/storage.js`
    - _Requirements: 2.3, 2.4, 2.6_

  - [x] 5.2 Implement shop settings endpoints
    - `GET /api/v1/shops/:shopId`: return shop details; enforce tenant middleware
    - `PATCH /api/v1/shops/:shopId`: update name (1–100), address (1–255), phone (7–20), contact email; persist and respond within 5 s
    - `POST /api/v1/shops/:shopId/logo`: accept upload via Multer, store to object store, update `shops.logo_url`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.8_

  - [x] 5.3 Write property test for image upload validation (Property 10)
    - **Property 10: Image upload validation**
    - **Validates: Requirements 2.3, 2.4, 2.6**
    - Tag: `// Feature: tailorstaq-platform, Property 10: Image upload validation`
    - File: `tests/pbt/image-upload-validation.test.js`
    - Generate random MIME types and file sizes; assert accepted iff MIME ∈ {png, jpeg, svg+xml} AND 1 ≤ size ≤ 5,242,880

- [x] 6. Products module
  - [x] 6.1 Implement product CRUD endpoints
    - Create `src/modules/products/products.routes.js` and `products.service.js`
    - `GET /api/v1/shops/:shopId/products`: list active products (tenant-scoped)
    - `POST /api/v1/shops/:shopId/products`: validate name (1–100), description (1–1000), price (0.01–999,999.99); check free-tier active product limit before insert; accept optional image upload
    - `PATCH /api/v1/shops/:shopId/products/:id`: update fields; re-check limit if activating a product
    - `DELETE /api/v1/shops/:shopId/products/:id`: soft-delete (set `active = false`)
    - _Requirements: 2.5, 2.6, 3.3, 3.4_

  - [x] 6.2 Write property test for free-tier limit enforcement (Property 5)
    - **Property 5: Free-tier limit enforcement**
    - **Validates: Requirements 3.3, 3.4**
    - Tag: `// Feature: tailorstaq-platform, Property 5: Free-tier limit enforcement`
    - File: `tests/pbt/subscription-limits.test.js`
    - Generate random product/order counts around the 10-product and 50-order boundaries; assert the 11th active product and 51st monthly order are always rejected with `LIMIT_EXCEEDED`

  - [x] 6.3 Write unit tests for product validation
    - Test boundary values: name length 0, 1, 100, 101; price 0.00, 0.01, 999999.99, 1000000.00
    - Test free-tier limit at exactly 10 and 11 active products
    - _Requirements: 2.5, 3.3_

- [ ] 7. Orders module
  - [x] 7.1 Implement order reference generator
    - Create `src/utils/orderRef.js`: generate cryptographically random 8–12 uppercase alphanumeric strings; verify uniqueness against `orders.reference` before returning
    - _Requirements: 5.2_

  - [x] 7.2 Implement order placement endpoint
    - Create `src/modules/orders/orders.routes.js` and `orders.service.js`
    - `POST /api/v1/shops/:shopId/orders`: validate quantity (1–99); check free-tier monthly order limit inside the same transaction as the insert; create order with `status = 'received'`; insert initial `order_status_history` row; enqueue order confirmation email
    - _Requirements: 5.1, 5.2, 3.3, 3.4_

  - [x] 7.3 Write property test for order reference uniqueness (Property 3)
    - **Property 3: Order reference uniqueness**
    - **Validates: Requirements 5.2**
    - Tag: `// Feature: tailorstaq-platform, Property 3: Order reference uniqueness`
    - File: `tests/pbt/order-reference.test.js`
    - Generate batches of N orders (N up to 1000); assert all reference values in the batch are distinct

  - [x] 7.4 Implement order status update endpoint
    - `PATCH /api/v1/shops/:shopId/orders/:id/status`: validate transition against lifecycle (`received → in-progress → ready-for-pickup → completed`, `cancelled` from any non-terminal); reject with `TERMINAL_ORDER_STATE` if order is `completed` or `cancelled`; persist new status + UTC timestamp to `order_status_history` inside a transaction; enqueue customer notification email; trigger receipt generation job if status = `completed`
    - _Requirements: 5.3, 5.4, 5.7, 5.8_

  - [x] 7.5 Write property test for order status lifecycle (Property 4)
    - **Property 4: Order status lifecycle validity**
    - **Validates: Requirements 5.3, 5.7, 5.8**
    - Tag: `// Feature: tailorstaq-platform, Property 4: Order status lifecycle validity`
    - File: `tests/pbt/order-status-lifecycle.test.js`
    - Generate random valid and invalid transition sequences; assert only valid transitions succeed and terminal states block further updates

  - [x] 7.6 Write property test for order status persistence (Property 12)
    - **Property 12: Order status change persistence regardless of notification**
    - **Validates: Requirements 5.4**
    - Tag: `// Feature: tailorstaq-platform, Property 12: Order status change persistence regardless of notification`
    - File: `tests/pbt/order-status-persistence.test.js`
    - Simulate notification worker failure; assert status and UTC timestamp are persisted in DB regardless

  - [x] 7.7 Implement customer order list and detail endpoints
    - `GET /customers/me/orders`: list all orders for authenticated customer (across shops); include reference, shop name, product name, quantity, status, last updated
    - `GET /customers/me/orders/:id`: return full order detail with complete `order_status_history`
    - _Requirements: 5.5, 5.6_

- [x] 8. Checkpoint — core backend
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Receipts and PDF generation
  - [x] 9.1 Implement PDF receipt worker
    - Create `src/queues/workers/pdf.worker.js`: consume `pdf-generation` BullMQ queue; use PDFKit to build receipt PDF containing shop logo (or TAILORSTAQ placeholder), shop name, address, phone, contact email (omit missing fields with "not provided" label), order reference, customer name, product name, quantity, unit price, line total, order total, completion date; upload PDF to object store; update `receipts` row with `pdf_url`; enqueue receipt email job
    - _Requirements: 6.1, 6.2, 6.3, 6.7, 6.8_

  - [x] 9.2 Implement receipt email worker and download endpoint
    - Create `src/queues/workers/email.worker.js` (shared): consume `email` BullMQ queue; send emails via Nodemailer; retry up to 3 times with exponential back-off (1 s, 4 s, 16 s); on exhaustion log to `notification_failures`; for receipt emails update `receipts.email_sent` and `receipts.email_error`
    - `GET /customers/me/orders/:id/receipt`: stream PDF from object store to client; return `404` if receipt not yet generated
    - _Requirements: 6.4, 6.5_

  - [-] 9.3 Write property test for receipt completeness (Property 6)
    - **Property 6: Receipt completeness**
    - **Validates: Requirements 6.2, 6.3**
    - Tag: `// Feature: tailorstaq-platform, Property 6: Receipt completeness`
    - File: `tests/pbt/receipt-completeness.test.js`
    - Generate random completed orders with varying shop data (including missing fields); assert every generated PDF contains all required fields or "not provided" labels

  - [-] 9.4 Write unit tests for receipt PDF structure
    - Test shop logo fallback when `logo_url` is null
    - Test "not provided" label for missing address, phone, contact email
    - Test all required order fields present
    - _Requirements: 6.2, 6.3, 6.7, 6.8_

- [ ] 10. Subscriptions module
  - [x] 10.1 Implement subscription query and upgrade endpoints
    - Create `src/modules/subscriptions/subscriptions.routes.js` and `subscriptions.service.js`
    - `GET /subscriptions/me`: return current tier, active product count vs limit, monthly order count vs limit, upgrade options
    - `POST /subscriptions/upgrade`: present price, billing period, paid-tier feature summary; create pending payment record; do NOT activate until confirmed
    - `POST /subscriptions/confirm`: validate payment confirmation; activate paid subscription; enqueue confirmation email
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 3.9_

  - [x] 10.2 Implement subscription expiry and downgrade job
    - Create a scheduled BullMQ job (or cron) that checks for expired paid subscriptions; downgrade to free tier; enqueue downgrade notification email; commit downgrade to DB before enqueuing email
    - _Requirements: 3.8_

  - [-] 10.3 Write property test for subscription downgrade on payment failure (Property 11)
    - **Property 11: Subscription downgrade on payment failure**
    - **Validates: Requirements 3.8**
    - Tag: `// Feature: tailorstaq-platform, Property 11: Subscription downgrade on payment failure`
    - File: `tests/pbt/subscription-downgrade.test.js`
    - Simulate payment failure with concurrent email delivery failure; assert tier is always set to Free in DB regardless of email outcome

  - [ ] 10.4 Write unit tests for subscription tier entitlement matrix
    - Test free-tier feature flags vs paid-tier feature flags
    - Test upgrade flow abandonment leaves tenant on free tier
    - _Requirements: 3.1, 3.6_

- [x] 11. Platform administration module
  - [x] 11.1 Implement tenant management endpoints
    - `GET /api/v1/admin/tenants`: list all tenants with business name, subscription tier, registration date, account status; require `platform_admin` role
    - `PATCH /api/v1/admin/tenants/:id/status`: suspend (set status `suspended`, invalidate active sessions, enqueue suspension email) or reactivate (set status `active`, enqueue reactivation email); reject with `ALREADY_IN_STATE` if already in requested state; commit status change before enqueuing email
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 11.2 Implement platform metrics endpoint
    - `GET /api/v1/admin/metrics`: accept `?from=` and `?to=` date range params; return total tenant count, active subscription counts by tier, total orders in range; require `platform_admin` role
    - _Requirements: 9.5_

  - [x] 11.3 Write unit tests for admin operations
    - Test suspend/reactivate idempotency guard (`ALREADY_IN_STATE`)
    - Test metrics aggregation with various date ranges
    - _Requirements: 9.4, 9.5_

- [ ] 12. Multi-tenancy and data isolation enforcement
  - [x] 12.1 Apply tenant middleware to all tenant-scoped routes
    - Wire `tenantMiddleware` onto all `/shops/:shopId/*` routes and any other routes that access tenant-scoped tables
    - Verify `queryTenant` helper is used in every data-access function that touches `shops`, `products`, `orders`, `order_status_history`, `receipts`
    - _Requirements: 7.1, 7.2, 7.5_

  - [ ] 12.2 Write property test for tenant data isolation (Property 1)
    - **Property 1: Tenant data isolation**
    - **Validates: Requirements 7.1, 7.2, 7.5**
    - Tag: `// Feature: tailorstaq-platform, Property 1: Tenant data isolation`
    - File: `tests/pbt/tenant-isolation.test.js`
    - Generate random `tenantId` pairs and resource types; assert every API response for Tenant A contains only records with `tenant_id = A`

  - [ ] 12.3 Write property test for cross-tenant access denial (Property 2)
    - **Property 2: Cross-tenant access is always denied**
    - **Validates: Requirements 7.3, 8.8**
    - Tag: `// Feature: tailorstaq-platform, Property 2: Cross-tenant access is always denied`
    - File: `tests/pbt/cross-tenant-access.test.js`
    - Generate random tenant pairs where IDs differ; assert every cross-tenant request returns `403 CROSS_TENANT_ACCESS` and writes an audit log row

  - [ ] 12.4 Write integration tests for cross-tenant 403 and audit log
    - Test that a Tenant_Admin accessing another tenant's shop returns 403
    - Test that the audit log row contains requesting tenant ID, target resource ID, and UTC timestamp
    - Test that the audit log is retrievable by Platform_Admin
    - _Requirements: 7.3_

- [ ] 13. Checkpoint — backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Vue.js 3 frontend — project setup and shared infrastructure
  - [ ] 14.1 Initialise Vue 3 project with Vite, Pinia, and Vue Router
    - Scaffold project with `npm create vue@latest` (Vite + Vue Router + Pinia + Vitest)
    - Configure Axios instance in `src/api/index.js` with base URL, `Authorization: Bearer <token>` interceptor, and global error interceptor that maps API error codes to human-readable messages (no raw status codes)
    - Define brand color CSS variables (white, dark blue, chocolate brown) in `src/assets/brand.css`
    - _Requirements: 10.1, 10.5_

  - [ ] 14.2 Implement auth Pinia store and navigation guards
    - Create `src/stores/auth.store.js`: state (`user`, `token`, `loading`), actions (`login`, `logout`, `registerCustomer`, `verifyEmail`)
    - Add Vue Router navigation guards: redirect unauthenticated users to `/login`; redirect by role to correct dashboard; block tenant-admin routes for suspended tenants
    - _Requirements: 8.1, 8.6, 8.7_

  - [ ] 14.3 Implement shared layout components
    - Create `NavBar.vue` with TAILORSTAQ logo and brand name visible on all pages
    - Create `LoadingSpinner.vue` displayed during any async API call
    - Create `ErrorBanner.vue` that renders human-readable error messages (no raw HTTP codes)
    - Create `Modal.vue` for confirmation dialogs
    - Ensure all components are responsive from 320 px to 1920 px
    - _Requirements: 10.2, 10.3, 10.4, 10.5_

- [ ] 15. Public views — landing, registration, login
  - [ ] 15.1 Implement public landing, login, and customer registration views
    - Create `src/views/public/LandingPage.vue`, `LoginView.vue`, `CustomerRegisterView.vue`
    - `LoginView`: form with email + password, show `LoadingSpinner` during submit, display lockout message and verification-required message from API error codes
    - `CustomerRegisterView`: form with full name, email, password; client-side password strength indicator; show verification-sent confirmation screen
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 8.4, 8.5_

  - [ ] 15.2 Implement tenant registration view
    - Create `src/views/public/TenantRegisterView.vue`: form with business name, contact email, phone, description; show pending-approval confirmation screen after submission
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 16. Platform_Admin dashboard views
  - [ ] 16.1 Implement approval request management view
    - Create `src/views/admin/ApprovalsView.vue`: list approval requests with status filter tabs (pending / approved / rejected); approve/reject actions with rejection reason modal; show loading and error states
    - _Requirements: 1.4, 1.5, 1.6, 1.8_

  - [ ] 16.2 Implement tenant management and metrics views
    - Create `src/views/admin/TenantsView.vue`: list tenants with subscription tier, registration date, status; suspend/reactivate actions with confirmation modal; `ALREADY_IN_STATE` error display
    - Create `src/views/admin/MetricsView.vue`: date range picker, display total tenants, subscriptions by tier, total orders
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 17. Tenant_Admin dashboard views
  - [ ] 17.1 Implement shop setup view
    - Create `src/views/tenant/ShopSetupView.vue`: form for shop name, logo upload (with file type/size validation feedback), address, phone, contact email; show current subscription tier and usage counters
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 3.9_

  - [ ] 17.2 Implement product management view
    - Create `src/views/tenant/ProductsView.vue`: list products with add/edit/delete actions; product form with name, description, price, optional image upload; show `LIMIT_EXCEEDED` banner with upgrade CTA when free-tier limit reached
    - _Requirements: 2.5, 2.6, 3.3, 3.4_

  - [ ] 17.3 Implement order management view
    - Create `src/views/tenant/OrdersView.vue`: list shop orders with status badges; status update dropdown (valid next states only); show `TERMINAL_ORDER_STATE` error inline; loading and error states
    - _Requirements: 5.3, 5.4, 5.7, 5.8_

  - [ ] 17.4 Implement subscription management view
    - Create `src/views/tenant/SubscriptionView.vue`: display current tier, usage counters, upgrade flow (price + billing period + feature summary → payment confirmation); show confirmation screen after upgrade
    - _Requirements: 3.1, 3.5, 3.6, 3.7, 3.9_

- [ ] 18. Customer views
  - [ ] 18.1 Implement customer order history and detail views
    - Create `src/views/customer/OrdersView.vue`: list all orders across shops (reference, shop name, product, quantity, status, last updated); link to detail view
    - Create `src/views/customer/OrderDetailView.vue`: full order detail with status history timeline; receipt download button (visible when status = `completed`)
    - _Requirements: 5.5, 5.6, 6.5_

  - [ ] 18.2 Implement customer profile view
    - Create `src/views/customer/ProfileView.vue`: update full name, email (with re-verification flow), password; show verification-pending notice when email change is in progress
    - _Requirements: 4.7, 4.8_

- [ ] 19. Frontend wiring and integration
  - [ ] 19.1 Wire all Pinia stores to API clients and connect views to stores
    - Create `src/stores/shop.store.js`, `orders.store.js`, `subscription.store.js` with full CRUD actions and loading/error state
    - Connect all views to their respective stores; ensure `LoadingSpinner` is shown for every async action and `ErrorBanner` is shown on every API error
    - _Requirements: 10.4, 10.5_

  - [ ] 19.2 Implement responsive layout and brand identity across all views
    - Apply brand CSS variables (white, dark blue, chocolate brown) to all components
    - Test and fix layout at 320 px, 768 px, 1280 px, and 1920 px viewports; ensure no horizontal scroll or content overlap
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ] 19.3 Write Vitest component unit tests for shared components
    - Test `LoadingSpinner` renders during loading state
    - Test `ErrorBanner` renders human-readable message and never shows raw HTTP codes
    - Test `NavBar` shows TAILORSTAQ logo on all route stubs
    - _Requirements: 10.2, 10.4, 10.5_

  - [ ] 19.4 Write Playwright end-to-end tests for critical flows
    - Test full registration → approval → shop setup → product creation → order placement flow
    - Test customer order placement → status update → receipt download flow
    - Test responsive layout at 320 px and 1920 px viewports
    - _Requirements: 1.3, 1.5, 2.7, 5.1, 6.5, 10.3_

- [ ] 20. Final checkpoint — full platform
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints at tasks 8, 13, and 20 ensure incremental validation
- Property-based tests use `fast-check` with a minimum of 100 iterations per property
- Unit tests use Jest + Supertest for backend; Vitest + Vue Test Utils for frontend
- All 12 correctness properties from the design document are covered by dedicated PBT sub-tasks
- The `queryTenant` helper and RLS policies together provide defense-in-depth tenant isolation


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "3.1", "3.2"] },
    { "id": 4, "tasks": ["3.3", "3.4", "4.1"] },
    { "id": 5, "tasks": ["4.2", "5.1"] },
    { "id": 6, "tasks": ["4.3", "5.2", "5.3"] },
    { "id": 7, "tasks": ["6.1", "7.1"] },
    { "id": 8, "tasks": ["6.2", "6.3", "7.2"] },
    { "id": 9, "tasks": ["7.3", "7.4"] },
    { "id": 10, "tasks": ["7.5", "7.6", "7.7"] },
    { "id": 11, "tasks": ["9.1", "10.1"] },
    { "id": 12, "tasks": ["9.2", "9.3", "9.4", "10.2", "10.3", "10.4"] },
    { "id": 13, "tasks": ["11.1", "12.1"] },
    { "id": 14, "tasks": ["11.2", "11.3", "12.2", "12.3", "12.4"] },
    { "id": 15, "tasks": ["14.1"] },
    { "id": 16, "tasks": ["14.2", "14.3"] },
    { "id": 17, "tasks": ["15.1", "15.2"] },
    { "id": 18, "tasks": ["16.1", "16.2", "17.1"] },
    { "id": 19, "tasks": ["17.2", "17.3", "17.4", "18.1", "18.2"] },
    { "id": 20, "tasks": ["19.1"] },
    { "id": 21, "tasks": ["19.2", "19.3", "19.4"] }
  ]
}
```
