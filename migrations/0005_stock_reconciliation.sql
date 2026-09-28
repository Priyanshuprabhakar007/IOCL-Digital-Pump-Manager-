-- Migration 0005: Phase 2B Stock Reconciliation, Tank Dip, Fuel Receipt & Quality Engine

-- 1. Idempotent Permissions Setup
INSERT OR IGNORE INTO `permissions` (`id`, `code`, `name`, `description`) VALUES
  ('perm-tcal-r', 'tank_calibration.read', 'Read Tank Calibration', 'View tank calibration charts and points'),
  ('perm-tcal-w', 'tank_calibration.write', 'Write Tank Calibration', 'Manage tank calibration charts and import data'),
  ('perm-tstk-r', 'tank_stock.read', 'Read Tank Stock', 'View tank physical dips and stock readings'),
  ('perm-tstk-w', 'tank_stock.write', 'Write Tank Stock', 'Record opening, closing, and ad-hoc tank dips'),
  ('perm-rcpt-r', 'fuel_receipts.read', 'Read Fuel Receipts', 'View tanker fuel receipts and delivery records'),
  ('perm-rcpt-w', 'fuel_receipts.write', 'Write Fuel Receipts', 'Record tanker delivery, decantation, and line measurements'),
  ('perm-qual-r', 'quality.read', 'Read Quality Parameters', 'View density and temperature quality records'),
  ('perm-qual-w', 'quality.write', 'Write Quality Parameters', 'Record fuel receipt density and temperature observations'),
  ('perm-qtol-m', 'quality_tolerance.manage', 'Manage Quality Tolerances', 'Configure scope-based density and quality tolerance rules'),
  ('perm-srec-r', 'stock_reconciliation.read', 'Read Stock Reconciliation', 'View shift and product level stock reconciliation summaries');

-- Role-Permission assignments
-- ADMIN: Full permissions
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'ADMIN' AND p.`code` IN (
  'tank_calibration.read', 'tank_calibration.write',
  'tank_stock.read', 'tank_stock.write',
  'fuel_receipts.read', 'fuel_receipts.write',
  'quality.read', 'quality.write', 'quality_tolerance.manage',
  'stock_reconciliation.read'
);

-- STATE_OFFICE: Read permissions and tolerance configuration within state
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'STATE_OFFICE' AND p.`code` IN (
  'tank_calibration.read', 'tank_stock.read', 'fuel_receipts.read',
  'quality.read', 'quality_tolerance.manage', 'stock_reconciliation.read'
);

-- DIVISIONAL_OFFICE, BUSINESS_MANAGER, FIELD_OFFICER: Read permissions
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` IN ('DIVISIONAL_OFFICE', 'BUSINESS_MANAGER', 'FIELD_OFFICER') AND p.`code` IN (
  'tank_calibration.read', 'tank_stock.read', 'fuel_receipts.read',
  'quality.read', 'stock_reconciliation.read'
);

-- DEALER: Full operational stock and receipt management for assigned outlet
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'DEALER' AND p.`code` IN (
  'tank_calibration.read', 'tank_calibration.write',
  'tank_stock.read', 'tank_stock.write',
  'fuel_receipts.read', 'fuel_receipts.write',
  'quality.read', 'quality.write',
  'stock_reconciliation.read'
);

-- CSP: Operational tank stock and receipt recording
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'CSP' AND p.`code` IN (
  'tank_calibration.read',
  'tank_stock.read', 'tank_stock.write',
  'fuel_receipts.read', 'fuel_receipts.write',
  'quality.read', 'quality.write',
  'stock_reconciliation.read'
);

-- 2. Tank Calibration Points Table
CREATE TABLE IF NOT EXISTS `tank_calibration_points` (
  `id` TEXT PRIMARY KEY,
  `tank_id` TEXT NOT NULL REFERENCES `tanks`(`id`) ON DELETE CASCADE,
  `dip_millimetres_milliunits` INTEGER NOT NULL,
  `volume_milliunits` INTEGER NOT NULL,
  `created_at` TEXT NOT NULL,
  `created_by` TEXT NOT NULL REFERENCES `users`(`id`),
  CONSTRAINT `chk_tcp_dip_positive` CHECK (`dip_millimetres_milliunits` >= 0),
  CONSTRAINT `chk_tcp_vol_positive` CHECK (`volume_milliunits` >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_tcp_tank_dip` ON `tank_calibration_points` (`tank_id`, `dip_millimetres_milliunits`);
CREATE INDEX IF NOT EXISTS `idx_tcp_tank_id` ON `tank_calibration_points` (`tank_id`);

-- 3. Operational Shift Tank Snapshot Table
CREATE TABLE IF NOT EXISTS `operational_shift_tanks` (
  `id` TEXT PRIMARY KEY,
  `operational_shift_id` TEXT NOT NULL REFERENCES `operational_shifts`(`id`) ON DELETE CASCADE,
  `outlet_id` TEXT NOT NULL REFERENCES `retail_outlets`(`id`) ON DELETE CASCADE,
  `tank_id` TEXT NOT NULL REFERENCES `tanks`(`id`),
  `tank_number` INTEGER NOT NULL,
  `tank_name` TEXT NOT NULL,
  `product_id` TEXT NOT NULL REFERENCES `products`(`id`),
  `product_code` TEXT NOT NULL,
  `product_name` TEXT NOT NULL,
  `product_unit` TEXT NOT NULL DEFAULT 'LITRE',
  `capacity_milliunits` INTEGER NOT NULL,
  `safe_fill_capacity_milliunits` INTEGER NOT NULL,
  `created_at` TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_ost_shift_tank` ON `operational_shift_tanks` (`operational_shift_id`, `tank_id`);
CREATE INDEX IF NOT EXISTS `idx_ost_shift_id` ON `operational_shift_tanks` (`operational_shift_id`);
CREATE INDEX IF NOT EXISTS `idx_ost_outlet_id` ON `operational_shift_tanks` (`outlet_id`);

-- 4. Tank Stock Readings Table
CREATE TABLE IF NOT EXISTS `tank_stock_readings` (
  `id` TEXT PRIMARY KEY,
  `operational_shift_id` TEXT NOT NULL REFERENCES `operational_shifts`(`id`) ON DELETE CASCADE,
  `outlet_id` TEXT NOT NULL REFERENCES `retail_outlets`(`id`) ON DELETE CASCADE,
  `tank_id` TEXT NOT NULL REFERENCES `tanks`(`id`),
  `product_id` TEXT NOT NULL REFERENCES `products`(`id`),
  `reading_type` TEXT NOT NULL CHECK(`reading_type` IN ('OPENING', 'CLOSING', 'PRE_RECEIPT', 'POST_RECEIPT', 'ADHOC')),
  `source` TEXT NOT NULL CHECK(`source` IN ('MANUAL', 'ATG')),
  `product_dip_mm_milliunits` INTEGER NOT NULL,
  `water_dip_mm_milliunits` INTEGER NOT NULL DEFAULT 0,
  `gross_observed_volume_milliunits` INTEGER NOT NULL,
  `water_volume_milliunits` INTEGER NOT NULL DEFAULT 0,
  `net_product_volume_milliunits` INTEGER NOT NULL,
  `recorded_at` TEXT NOT NULL,
  `recorded_by_user_id` TEXT NOT NULL REFERENCES `users`(`id`),
  `notes` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  CONSTRAINT `chk_tsr_dips` CHECK (`water_dip_mm_milliunits` <= `product_dip_mm_milliunits`),
  CONSTRAINT `chk_tsr_vols` CHECK (`water_volume_milliunits` <= `gross_observed_volume_milliunits`),
  CONSTRAINT `chk_tsr_net` CHECK (`net_product_volume_milliunits` >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_tsr_single_opening` ON `tank_stock_readings` (`operational_shift_id`, `tank_id`) WHERE `reading_type` = 'OPENING';
CREATE UNIQUE INDEX IF NOT EXISTS `idx_tsr_single_closing` ON `tank_stock_readings` (`operational_shift_id`, `tank_id`) WHERE `reading_type` = 'CLOSING';
CREATE INDEX IF NOT EXISTS `idx_tsr_shift_id` ON `tank_stock_readings` (`operational_shift_id`);
CREATE INDEX IF NOT EXISTS `idx_tsr_outlet_id` ON `tank_stock_readings` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_tsr_tank_id` ON `tank_stock_readings` (`tank_id`);

-- 5. Fuel Receipts Header Table
CREATE TABLE IF NOT EXISTS `fuel_receipts` (
  `id` TEXT PRIMARY KEY,
  `outlet_id` TEXT NOT NULL REFERENCES `retail_outlets`(`id`) ON DELETE CASCADE,
  `operational_shift_id` TEXT NOT NULL REFERENCES `operational_shifts`(`id`) ON DELETE CASCADE,
  `tt_number` TEXT NOT NULL,
  `invoice_number` TEXT NOT NULL,
  `invoice_date` TEXT NOT NULL,
  `arrival_at` TEXT NOT NULL,
  `decantation_started_at` TEXT,
  `decantation_completed_at` TEXT,
  `seal_verified` INTEGER NOT NULL DEFAULT 1,
  `seal_exception_reason` TEXT,
  `status` TEXT NOT NULL CHECK(`status` IN ('ARRIVED', 'VERIFIED', 'DECANTED', 'COMPLETED', 'CANCELLED')) DEFAULT 'ARRIVED',
  `recorded_by_user_id` TEXT NOT NULL REFERENCES `users`(`id`),
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_fr_outlet_id` ON `fuel_receipts` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_fr_shift_id` ON `fuel_receipts` (`operational_shift_id`);

-- 6. Fuel Receipt Tank Lines Table
CREATE TABLE IF NOT EXISTS `fuel_receipt_tank_lines` (
  `id` TEXT PRIMARY KEY,
  `fuel_receipt_id` TEXT NOT NULL REFERENCES `fuel_receipts`(`id`) ON DELETE CASCADE,
  `tank_id` TEXT NOT NULL REFERENCES `tanks`(`id`),
  `product_id` TEXT NOT NULL REFERENCES `products`(`id`),
  `invoice_quantity_milliunits` INTEGER NOT NULL,
  `pre_decant_reading_id` TEXT REFERENCES `tank_stock_readings`(`id`),
  `post_decant_reading_id` TEXT REFERENCES `tank_stock_readings`(`id`),
  `measured_received_quantity_milliunits` INTEGER,
  `receipt_variance_milliunits` INTEGER,
  `density_milliunits` INTEGER,
  `temperature_milliunits` INTEGER,
  `invoice_density_milliunits` INTEGER,
  `density_variance_milliunits` INTEGER,
  `quality_status` TEXT NOT NULL CHECK(`quality_status` IN ('PASS', 'OUT_OF_TOLERANCE', 'NOT_EVALUATED')) DEFAULT 'NOT_EVALUATED',
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_frtl_receipt_id` ON `fuel_receipt_tank_lines` (`fuel_receipt_id`);
CREATE INDEX IF NOT EXISTS `idx_frtl_tank_id` ON `fuel_receipt_tank_lines` (`tank_id`);

-- 7. Quality Tolerance Settings Table
CREATE TABLE IF NOT EXISTS `quality_tolerance_settings` (
  `id` TEXT PRIMARY KEY,
  `scope_type` TEXT NOT NULL CHECK(`scope_type` IN ('GLOBAL', 'STATE', 'DIVISION', 'OUTLET')),
  `scope_entity_id` TEXT,
  `product_id` TEXT REFERENCES `products`(`id`),
  `density_tolerance_milliunits` INTEGER NOT NULL,
  `status` TEXT NOT NULL CHECK(`status` IN ('ACTIVE', 'INACTIVE')) DEFAULT 'ACTIVE',
  `effective_from` TEXT NOT NULL,
  `effective_to` TEXT,
  `created_at` TEXT NOT NULL,
  `created_by` TEXT NOT NULL REFERENCES `users`(`id`)
);

CREATE INDEX IF NOT EXISTS `idx_qts_scope` ON `quality_tolerance_settings` (`scope_type`, `scope_entity_id`);
CREATE INDEX IF NOT EXISTS `idx_qts_product` ON `quality_tolerance_settings` (`product_id`);

-- 8. Shift Stock Reconciliation Table
CREATE TABLE IF NOT EXISTS `shift_stock_reconciliations` (
  `id` TEXT PRIMARY KEY,
  `operational_shift_id` TEXT NOT NULL REFERENCES `operational_shifts`(`id`) ON DELETE CASCADE,
  `outlet_id` TEXT NOT NULL REFERENCES `retail_outlets`(`id`) ON DELETE CASCADE,
  `tank_id` TEXT NOT NULL REFERENCES `tanks`(`id`),
  `product_id` TEXT NOT NULL REFERENCES `products`(`id`),
  `opening_stock_milliunits` INTEGER NOT NULL,
  `receipt_quantity_milliunits` INTEGER NOT NULL DEFAULT 0,
  `sales_quantity_milliunits` INTEGER NOT NULL DEFAULT 0,
  `theoretical_closing_stock_milliunits` INTEGER NOT NULL,
  `physical_closing_stock_milliunits` INTEGER NOT NULL,
  `variance_milliunits` INTEGER NOT NULL,
  `variance_status` TEXT NOT NULL CHECK(`variance_status` IN ('GAIN', 'LOSS', 'BALANCED')),
  `calculated_at` TEXT NOT NULL,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_ssr_shift_tank` ON `shift_stock_reconciliations` (`operational_shift_id`, `tank_id`);
CREATE INDEX IF NOT EXISTS `idx_ssr_shift_id` ON `shift_stock_reconciliations` (`operational_shift_id`);
CREATE INDEX IF NOT EXISTS `idx_ssr_outlet_id` ON `shift_stock_reconciliations` (`outlet_id`);
