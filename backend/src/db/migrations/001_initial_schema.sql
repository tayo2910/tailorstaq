-- Migration 001: Initial schema
-- Task 1.2 — Create all tables, enable RLS, add indexes
-- Requirements: 7.1, 7.5

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- TENANTS
-- Platform-level tenant registry. Not tenant-scoped itself.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name    VARCHAR(100) NOT NULL,
  contact_email    VARCHAR(255) NOT NULL UNIQUE,
  phone            VARCHAR(20)  NOT NULL,
  business_description TEXT    NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'suspended')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- APPROVAL_REQUESTS
-- Prospective tenant registration submissions.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_requests (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name        VARCHAR(100) NOT NULL,
  contact_email        VARCHAR(255) NOT NULL,
  phone                VARCHAR(20)  NOT NULL,
  business_description TEXT         NOT NULL,
  status               VARCHAR(20)  NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason     TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  reviewed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status
  ON approval_requests (status);

CREATE INDEX IF NOT EXISTS idx_approval_requests_contact_email
  ON approval_requests (contact_email);

-- ─────────────────────────────────────────────────────────────────────────────
-- SHOPS
-- One shop per tenant. Tenant-scoped.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name          VARCHAR(100),
  logo_url      TEXT,
  address       VARCHAR(255),
  phone         VARCHAR(20),
  contact_email VARCHAR(255),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shops_tenant_id
  ON shops (tenant_id);

-- Enable RLS on shops
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON shops
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS
-- Billing plan per tenant. Tenant-scoped.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  tier         VARCHAR(20)  NOT NULL DEFAULT 'free'
                 CHECK (tier IN ('free', 'paid')),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  status       VARCHAR(20)  NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id
  ON subscriptions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS
-- Platform-level user accounts (all roles).
-- tenant_id is NULL for customers and platform_admin.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   TEXT         NOT NULL,
  role            VARCHAR(20)  NOT NULL
                    CHECK (role IN ('platform_admin', 'tenant_admin', 'customer')),
  tenant_id       UUID         REFERENCES tenants (id) ON DELETE SET NULL,
  account_status  VARCHAR(30)  NOT NULL DEFAULT 'pending_verification'
                    CHECK (account_status IN ('pending_verification', 'active', 'locked')),
  failed_attempts INT          NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email
  ON users (email);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id
  ON users (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- EMAIL_VERIFICATIONS
-- One-time tokens for email address verification.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_token
  ON email_verifications (token);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id
  ON email_verifications (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCTS
-- Tenant-scoped catalogue items.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID           NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  shop_id     UUID           NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
  name        VARCHAR(100)   NOT NULL,
  description TEXT           NOT NULL,
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0.01 AND price <= 999999.99),
  image_url   TEXT,
  active      BOOLEAN        NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_id
  ON products (tenant_id);

CREATE INDEX IF NOT EXISTS idx_products_shop_id
  ON products (shop_id);

CREATE INDEX IF NOT EXISTS idx_products_tenant_active
  ON products (tenant_id, active);

-- Enable RLS on products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- ORDERS
-- Tenant-scoped customer orders.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID           NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  shop_id     UUID           NOT NULL REFERENCES shops (id) ON DELETE CASCADE,
  customer_id UUID           NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  product_id  UUID           NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  reference   VARCHAR(12)    NOT NULL UNIQUE,
  quantity    INT            NOT NULL CHECK (quantity >= 1 AND quantity <= 99),
  unit_price  NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0.01),
  status      VARCHAR(20)    NOT NULL DEFAULT 'received'
                CHECK (status IN ('received', 'in-progress', 'ready-for-pickup', 'completed', 'cancelled')),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id
  ON orders (tenant_id);

CREATE INDEX IF NOT EXISTS idx_orders_reference
  ON orders (reference);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON orders (customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_shop_id
  ON orders (shop_id);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_created_at
  ON orders (tenant_id, created_at);

-- Enable RLS on orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- ORDER_STATUS_HISTORY
-- Immutable audit trail of every status transition. Tenant-scoped.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL
                CHECK (status IN ('received', 'in-progress', 'ready-for-pickup', 'completed', 'cancelled')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id
  ON order_status_history (order_id);

CREATE INDEX IF NOT EXISTS idx_order_status_history_tenant_id
  ON order_status_history (tenant_id);

-- Enable RLS on order_status_history
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON order_status_history
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- RECEIPTS
-- PDF receipt records for completed orders. Tenant-scoped.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID        NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
  tenant_id    UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  pdf_url      TEXT,
  email_sent   BOOLEAN     NOT NULL DEFAULT false,
  email_error  TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_order_id
  ON receipts (order_id);

CREATE INDEX IF NOT EXISTS idx_receipts_tenant_id
  ON receipts (tenant_id);

-- Enable RLS on receipts
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON receipts
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT_LOGS
-- Cross-tenant access attempts and other security events.
-- Not tenant-scoped (readable by platform_admin only).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requesting_tenant_id UUID,
  target_resource_id   TEXT        NOT NULL,
  action               TEXT        NOT NULL,
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_requesting_tenant_id
  ON audit_logs (requesting_tenant_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at
  ON audit_logs (occurred_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICATION_FAILURES
-- Exhausted BullMQ retry records for failed email deliveries.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_failures (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     TEXT        NOT NULL,
  job_data     JSONB       NOT NULL,
  error_message TEXT       NOT NULL,
  failed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_failures_failed_at
  ON notification_failures (failed_at);
