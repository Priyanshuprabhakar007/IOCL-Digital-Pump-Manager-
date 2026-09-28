-- Migration 0011: Phase 2C Completion - Permissions and Hardening

-- 1. Correct Permissions
INSERT OR IGNORE INTO permissions (id, code, name, description) VALUES
('perm-price-r', 'product_prices.read', 'Read product prices', 'Can view outlet product prices'),
('perm-price-w', 'product_prices.write', 'Write product prices', 'Can manage outlet product prices'),
('perm-cparty-r', 'credit_parties.read', 'Read credit parties', 'Can view outlet credit parties'),
('perm-cparty-w', 'credit_parties.write', 'Write credit parties', 'Can manage outlet credit parties'),
('perm-coll-r', 'collections.read', 'Read collections', 'Can view shift collections'),
('perm-coll-w', 'collections.write', 'Write collections', 'Can manage shift collections'),
('perm-chand-r', 'cash_handover.read', 'Read cash handover', 'Can view cash handover logs'),
('perm-chand-w', 'cash_handover.write', 'Write cash handover', 'Can manage cash handover logs'),
('perm-chand-a', 'cash_handover.acknowledge', 'Acknowledge cash handover', 'Can acknowledge cash handover logs'),
('perm-bdep-r', 'bank_deposits.read', 'Read bank deposits', 'Can view bank deposit logs'),
('perm-bdep-w', 'bank_deposits.write', 'Write bank deposits', 'Can manage bank deposit logs'),
('perm-bdep-v', 'bank_deposits.verify', 'Verify bank deposits', 'Can verify bank deposit logs'),
('perm-frec-r', 'financial_reconciliation.read', 'Read financial reconciliation', 'Can view financial reconciliation reports');

-- 2. Role-Permission Mappings (Least Privilege)
-- ADMIN: all
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'ADMIN' AND p.id LIKE 'perm-%';

-- STATE_OFFICE
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'STATE_OFFICE' AND p.id IN (
  'perm-price-r', 'perm-cparty-r', 'perm-coll-r', 'perm-chand-r', 'perm-bdep-r', 'perm-bdep-v', 'perm-frec-r'
);

-- DIVISIONAL_OFFICE
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'DIVISIONAL_OFFICE' AND p.id IN (
  'perm-price-r', 'perm-cparty-r', 'perm-coll-r', 'perm-chand-r', 'perm-bdep-r', 'perm-bdep-v', 'perm-frec-r'
);

-- BUSINESS_MANAGER
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'BUSINESS_MANAGER' AND p.id IN (
  'perm-price-r', 'perm-cparty-r', 'perm-coll-r', 'perm-chand-r', 'perm-bdep-r', 'perm-bdep-v', 'perm-frec-r'
);

-- FIELD_OFFICER
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'FIELD_OFFICER' AND p.id IN (
  'perm-price-r', 'perm-cparty-r', 'perm-coll-r', 'perm-chand-r', 'perm-bdep-r', 'perm-frec-r'
);

-- DEALER
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'DEALER' AND p.id IN (
  'perm-price-r', 'perm-price-w', 'perm-cparty-r', 'perm-cparty-w', 'perm-coll-r', 'perm-coll-w', 'perm-chand-r', 'perm-chand-w', 'perm-chand-a', 'perm-bdep-r', 'perm-bdep-w', 'perm-frec-r'
);

-- CSP
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'CSP' AND p.id IN (
  'perm-coll-r', 'perm-coll-w', 'perm-chand-r', 'perm-chand-w'
);

-- 3. Schema Hardening (Table Rebuilds for FKs and Checks)
-- outlet_product_prices
CREATE TABLE outlet_product_prices_v2 (
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
INSERT INTO outlet_product_prices_v2 SELECT * FROM outlet_product_prices;
DROP TABLE outlet_product_prices;
ALTER TABLE outlet_product_prices_v2 RENAME TO outlet_product_prices;
CREATE INDEX idx_opp_outlet_product ON outlet_product_prices(outlet_id, product_id);

-- operational_shift_product_prices
CREATE TABLE operational_shift_product_prices_v2 (
  id TEXT PRIMARY KEY,
  operational_shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  price_paise_per_unit INTEGER NOT NULL,
  source_price_id TEXT NOT NULL REFERENCES outlet_product_prices(id),
  created_at TEXT NOT NULL,
  UNIQUE(operational_shift_id, product_id)
);
INSERT INTO operational_shift_product_prices_v2 SELECT * FROM operational_shift_product_prices;
DROP TABLE operational_shift_product_prices;
ALTER TABLE operational_shift_product_prices_v2 RENAME TO operational_shift_product_prices;
CREATE INDEX idx_ospp_shift ON operational_shift_product_prices(operational_shift_id);

-- credit_parties
CREATE TABLE credit_parties_v2 (
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
INSERT INTO credit_parties_v2 SELECT * FROM credit_parties;
DROP TABLE credit_parties;
ALTER TABLE credit_parties_v2 RENAME TO credit_parties;
CREATE INDEX idx_cp_outlet_status ON credit_parties(outlet_id, status);

-- shift_collections (Add snapshots and FKs)
CREATE TABLE shift_collections_v2 (
  id TEXT PRIMARY KEY,
  operational_shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  collection_type TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  provider TEXT,
  reference_number TEXT,
  credit_party_id TEXT REFERENCES credit_parties(id),
  credit_party_code_snapshot TEXT,
  credit_party_name_snapshot TEXT,
  collected_at TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO shift_collections_v2 (
  id, operational_shift_id, outlet_id, collection_type, amount_paise, provider, reference_number,
  credit_party_id, collected_at, recorded_by_user_id, notes, created_at, updated_at,
  credit_party_code_snapshot, credit_party_name_snapshot
)
SELECT 
  id, operational_shift_id, outlet_id, collection_type, amount_paise, provider, reference_number,
  credit_party_id, collected_at, recorded_by_user_id, notes, created_at, updated_at,
  NULL, NULL
FROM shift_collections;
DROP TABLE shift_collections;
ALTER TABLE shift_collections_v2 RENAME TO shift_collections;
CREATE INDEX idx_sc_shift_outlet ON shift_collections(operational_shift_id, outlet_id);

-- cash_handover_logs
CREATE TABLE cash_handover_logs_v2 (
  id TEXT PRIMARY KEY,
  operational_shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  handed_over_by_user_id TEXT NOT NULL REFERENCES users(id),
  received_by_user_id TEXT REFERENCES users(id),
  handed_over_at TEXT NOT NULL,
  received_at TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO cash_handover_logs_v2 SELECT * FROM cash_handover_logs;
DROP TABLE cash_handover_logs;
ALTER TABLE cash_handover_logs_v2 RENAME TO cash_handover_logs;
CREATE INDEX idx_chl_shift_outlet ON cash_handover_logs(operational_shift_id, outlet_id);

-- bank_deposits
CREATE TABLE bank_deposits_v2 (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL REFERENCES retail_outlets(id),
  operational_shift_id TEXT NOT NULL REFERENCES operational_shifts(id),
  deposit_channel TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  deposit_date TEXT NOT NULL,
  reference_number TEXT,
  document_id TEXT REFERENCES documents(id),
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  verified_by_user_id TEXT REFERENCES users(id),
  verified_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO bank_deposits_v2 SELECT * FROM bank_deposits;
DROP TABLE bank_deposits;
ALTER TABLE bank_deposits_v2 RENAME TO bank_deposits;
CREATE INDEX idx_bd_shift_outlet_status ON bank_deposits(operational_shift_id, outlet_id, status);
