-- Migration 0010: Financial Integrity Strengthening

-- 1. Create temporary tables to handle constraints and add FKs safely
CREATE TABLE credit_parties_new (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  party_code TEXT NOT NULL,
  party_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  UNIQUE(outlet_id, party_code)
);
INSERT INTO credit_parties_new SELECT * FROM credit_parties;
DROP TABLE credit_parties;
ALTER TABLE credit_parties_new RENAME TO credit_parties;
CREATE INDEX idx_cp_outlet_status ON credit_parties(outlet_id, status);

CREATE TABLE outlet_product_prices_new (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  price_paise_per_unit INTEGER NOT NULL CHECK (price_paise_per_unit > 0),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id)
);
INSERT INTO outlet_product_prices_new SELECT * FROM outlet_product_prices;
DROP TABLE outlet_product_prices;
ALTER TABLE outlet_product_prices_new RENAME TO outlet_product_prices;
CREATE INDEX idx_opp_outlet_product ON outlet_product_prices(outlet_id, product_id);

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ospp_shift ON operational_shift_product_prices(operational_shift_id);
CREATE INDEX IF NOT EXISTS idx_sc_shift_outlet ON shift_collections(operational_shift_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_chl_shift_outlet ON cash_handover_logs(operational_shift_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_bd_shift_outlet_status ON bank_deposits(operational_shift_id, outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_sfr_shift_outlet ON shift_financial_reconciliations(operational_shift_id, outlet_id);

-- 3. Historical snapshots for collections
ALTER TABLE shift_collections ADD COLUMN credit_party_code_snapshot TEXT;
ALTER TABLE shift_collections ADD COLUMN credit_party_name_snapshot TEXT;
