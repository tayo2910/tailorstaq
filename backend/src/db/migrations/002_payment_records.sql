-- Migration 002: Payment records for subscription upgrade flow
-- Task 10.1 — Subscription upgrade pending payment tracking
-- Requirements: 3.5, 3.6

-- ─────────────────────────────────────────────────────────────────────────────
-- PAYMENT_RECORDS
-- Pending and confirmed payment records for subscription upgrades.
-- A record is created when a Tenant_Admin initiates the upgrade flow and
-- is NOT activated until payment is confirmed (Requirement 3.5, 3.6).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_records (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  tier            VARCHAR(20)  NOT NULL DEFAULT 'paid'
                    CHECK (tier IN ('paid')),
  billing_period  VARCHAR(20)  NOT NULL DEFAULT 'monthly'
                    CHECK (billing_period IN ('monthly', 'annual')),
  amount          NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency        VARCHAR(3)   NOT NULL DEFAULT 'USD',
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'abandoned')),
  payment_reference TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  confirmed_at    TIMESTAMPTZ,
  abandoned_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_records_tenant_id
  ON payment_records (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payment_records_status
  ON payment_records (status);

CREATE INDEX IF NOT EXISTS idx_payment_records_tenant_status
  ON payment_records (tenant_id, status);
