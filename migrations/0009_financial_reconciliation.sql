-- Migration 0009: Financial Reconciliation
-- Add financial management tables

-- 1. Product Price Master
CREATE TABLE IF NOT EXISTS outlet_product_prices (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  price_paise_per_unit INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

-- 2. Shift Product Price Snapshot
CREATE TABLE IF NOT EXISTS operational_shift_product_prices (
  id TEXT PRIMARY KEY,
  operational_shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  price_paise_per_unit INTEGER NOT NULL,
  source_price_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(operational_shift_id, product_id)
);

-- 3. Credit Parties
CREATE TABLE IF NOT EXISTS credit_parties (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  party_code TEXT NOT NULL,
  party_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE(outlet_id, party_code)
);

-- 4. Shift Collections
CREATE TABLE IF NOT EXISTS shift_collections (
  id TEXT PRIMARY KEY,
  operational_shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  collection_type TEXT NOT NULL, -- CASH, POS_CARD, UPI, FLEET_CARD, CREDIT_SALE, DIRECT_BANK_DROP
  amount_paise INTEGER NOT NULL,
  provider TEXT,
  reference_number TEXT,
  credit_party_id TEXT REFERENCES credit_parties(id),
  collected_at TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 5. Cash Handover Log
CREATE TABLE IF NOT EXISTS cash_handover_logs (
  id TEXT PRIMARY KEY,
  operational_shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  amount_paise INTEGER NOT NULL,
  handed_over_by_user_id TEXT NOT NULL,
  received_by_user_id TEXT,
  handed_over_at TEXT NOT NULL,
  received_at TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 6. Bank Deposits
CREATE TABLE IF NOT EXISTS bank_deposits (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  operational_shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
  deposit_channel TEXT NOT NULL, -- BANK_BRANCH, CASH_DROP_BOX
  amount_paise INTEGER NOT NULL,
  deposit_date TEXT NOT NULL,
  reference_number TEXT,
  document_id TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED', -- SUBMITTED, VERIFIED, REJECTED
  recorded_by_user_id TEXT NOT NULL,
  verified_by_user_id TEXT,
  verified_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 7. Shift Financial Reconciliation
CREATE TABLE IF NOT EXISTS shift_financial_reconciliations (
  id TEXT PRIMARY KEY,
  operational_shift_id TEXT NOT NULL REFERENCES operational_shifts(id) UNIQUE,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  fuel_sales_revenue_paise INTEGER NOT NULL,
  cng_sales_revenue_paise INTEGER,
  lube_sales_revenue_paise INTEGER,
  authoritative_sales_revenue_paise INTEGER NOT NULL,
  cash_collection_paise INTEGER NOT NULL,
  pos_collection_paise INTEGER NOT NULL,
  upi_collection_paise INTEGER NOT NULL,
  fleet_card_collection_paise INTEGER NOT NULL,
  credit_sales_paise INTEGER NOT NULL,
  direct_bank_drop_paise INTEGER NOT NULL,
  total_collections_paise INTEGER NOT NULL,
  sales_collection_variance_paise INTEGER NOT NULL,
  variance_status TEXT NOT NULL, -- BALANCED, SHORTAGE, EXCESS
  variance_reason TEXT,
  calculated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
