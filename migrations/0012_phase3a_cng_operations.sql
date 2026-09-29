-- Phase 3A-1: CNG Operations Core Backend

-- 1. CNG Shift Logs
CREATE TABLE cng_shift_logs (
    id TEXT PRIMARY KEY,
    operational_shift_id TEXT NOT NULL UNIQUE,
    outlet_id TEXT NOT NULL,
    mfm_opening_kg_milliunits INTEGER NOT NULL,
    mfm_closing_kg_milliunits INTEGER NOT NULL,
    net_sales_kg_milliunits INTEGER NOT NULL,
    grid_intake_kg_milliunits INTEGER,
    grid_sales_variance_kg_milliunits INTEGER,
    recorded_by_user_id TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (operational_shift_id) REFERENCES operational_shifts(id),
    FOREIGN KEY (outlet_id) REFERENCES retail_outlets(id),
    FOREIGN KEY (recorded_by_user_id) REFERENCES users(id),
    CHECK (mfm_opening_kg_milliunits >= 0),
    CHECK (mfm_closing_kg_milliunits >= mfm_opening_kg_milliunits),
    CHECK (net_sales_kg_milliunits = mfm_closing_kg_milliunits - mfm_opening_kg_milliunits),
    CHECK (
        (grid_intake_kg_milliunits IS NULL AND grid_sales_variance_kg_milliunits IS NULL) OR
        (grid_intake_kg_milliunits IS NOT NULL AND grid_intake_kg_milliunits >= 0 AND grid_sales_variance_kg_milliunits = grid_intake_kg_milliunits - net_sales_kg_milliunits)
    )
);

-- 2. CNG Pressure Readings
CREATE TABLE cng_pressure_readings (
    id TEXT PRIMARY KEY,
    operational_shift_id TEXT NOT NULL,
    outlet_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    pressure_unit TEXT NOT NULL,
    suction_pressure_milliunits INTEGER,
    discharge_pressure_milliunits INTEGER,
    cascade_pressure_milliunits INTEGER,
    recorded_by_user_id TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (operational_shift_id) REFERENCES operational_shifts(id),
    FOREIGN KEY (outlet_id) REFERENCES retail_outlets(id),
    FOREIGN KEY (recorded_by_user_id) REFERENCES users(id),
    CHECK (suction_pressure_milliunits IS NULL OR suction_pressure_milliunits >= 0),
    CHECK (discharge_pressure_milliunits IS NULL OR discharge_pressure_milliunits >= 0),
    CHECK (cascade_pressure_milliunits IS NULL OR cascade_pressure_milliunits >= 0),
    CHECK (suction_pressure_milliunits IS NOT NULL OR discharge_pressure_milliunits IS NOT NULL OR cascade_pressure_milliunits IS NOT NULL)
);

-- 3. Indexes
CREATE INDEX idx_cng_shift_logs_outlet_id ON cng_shift_logs(outlet_id);
CREATE INDEX idx_cng_shift_logs_shift_id ON cng_shift_logs(operational_shift_id);

CREATE INDEX idx_cng_pressure_readings_shift_at ON cng_pressure_readings(operational_shift_id, recorded_at);
CREATE INDEX idx_cng_pressure_readings_outlet_at ON cng_pressure_readings(outlet_id, recorded_at);

-- 4. Permissions
INSERT OR IGNORE INTO permissions (id, code, name, description) VALUES 
('perm-cng-read', 'cng_operations.read', 'Read CNG Operations', 'Allows viewing CNG operational logs and pressure readings'),
('perm-cng-write', 'cng_operations.write', 'Write CNG Operations', 'Allows creating and managing CNG operational logs and pressure readings');

-- 5. Role Permissions (Default mappings based on least privilege)
-- ADMIN gets both
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) 
SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = 'ADMIN' AND p.code IN ('cng_operations.read', 'cng_operations.write');

-- STATE_OFFICE, DIVISIONAL_OFFICE, BUSINESS_MANAGER, FIELD_OFFICER get read
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) 
SELECT r.id, p.id FROM roles r, permissions p WHERE r.code IN ('STATE_OFFICE', 'DIVISIONAL_OFFICE', 'BUSINESS_MANAGER', 'FIELD_OFFICER') AND p.code = 'cng_operations.read';

-- DEALER and CSP get read + write
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) 
SELECT r.id, p.id FROM roles r, permissions p WHERE r.code IN ('DEALER', 'CSP') AND p.code IN ('cng_operations.read', 'cng_operations.write');
