-- Migration 0010: Financial Integrity Strengthening

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_opp_outlet_product ON outlet_product_prices(outlet_id, product_id);
CREATE INDEX IF NOT EXISTS idx_ospp_shift ON operational_shift_product_prices(operational_shift_id);
CREATE INDEX IF NOT EXISTS idx_cp_outlet_status ON credit_parties(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_sc_shift_outlet ON shift_collections(operational_shift_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_chl_shift_outlet ON cash_handover_logs(operational_shift_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_bd_shift_outlet_status ON bank_deposits(operational_shift_id, outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_sfr_shift_outlet ON shift_financial_reconciliations(operational_shift_id, outlet_id);

-- Foreign Key snapshots and references
ALTER TABLE outlet_product_prices ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);
ALTER TABLE operational_shift_product_prices ADD COLUMN IF NOT EXISTS source_price_id TEXT REFERENCES outlet_product_prices(id);
ALTER TABLE credit_parties ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);
ALTER TABLE shift_collections ADD COLUMN IF NOT EXISTS recorded_by_user_id TEXT REFERENCES users(id);
ALTER TABLE cash_handover_logs ADD COLUMN IF NOT EXISTS handed_over_by_user_id TEXT REFERENCES users(id);
ALTER TABLE cash_handover_logs ADD COLUMN IF NOT EXISTS received_by_user_id TEXT REFERENCES users(id);
ALTER TABLE bank_deposits ADD COLUMN IF NOT EXISTS document_id TEXT REFERENCES documents(id);
ALTER TABLE bank_deposits ADD COLUMN IF NOT EXISTS recorded_by_user_id TEXT REFERENCES users(id);
ALTER TABLE bank_deposits ADD COLUMN IF NOT EXISTS verified_by_user_id TEXT REFERENCES users(id);

-- Historical Credit Party Snapshots in shift_collections
ALTER TABLE shift_collections ADD COLUMN IF NOT EXISTS credit_party_code_snapshot TEXT;
ALTER TABLE shift_collections ADD COLUMN IF NOT EXISTS credit_party_name_snapshot TEXT;
