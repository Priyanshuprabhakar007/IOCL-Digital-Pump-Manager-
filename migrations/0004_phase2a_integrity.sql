-- Migration 0004: Phase 2A Database Integrity & Scaled-Integer Storage for IOCL Digital Pump Manager

-- 1. Idempotent Permission Data Migration for Existing Databases
INSERT OR IGNORE INTO `permissions` (`id`, `code`, `name`, `description`) VALUES
  ('perm-prod-r', 'products.read', 'Read Products', 'View master fuel products catalog'),
  ('perm-prod-mg', 'products.manage_global', 'Manage Global Products', 'Manage global products catalog'),
  ('perm-oprod-r', 'outlet_products.read', 'Read Outlet Products', 'View outlet product assignments'),
  ('perm-oprod-w', 'outlet_products.write', 'Write Outlet Products', 'Assign products to outlet'),
  ('perm-tank-r', 'tanks.read', 'Read Tanks', 'View underground storage tank master'),
  ('perm-tank-w', 'tanks.write', 'Write Tanks', 'Manage underground storage tanks'),
  ('perm-disp-r', 'dispensers.read', 'Read Dispensers', 'View dispenser units master'),
  ('perm-disp-w', 'dispensers.write', 'Write Dispensers', 'Manage dispenser units'),
  ('perm-nozz-r', 'nozzles.read', 'Read Nozzles', 'View dispensing nozzles master'),
  ('perm-nozz-w', 'nozzles.write', 'Write Nozzles', 'Manage dispensing nozzles'),
  ('perm-stm-r', 'shift_templates.read', 'Read Shift Templates', 'View shift templates'),
  ('perm-stm-w', 'shift_templates.write', 'Write Shift Templates', 'Configure shift templates'),
  ('perm-shf-r', 'shifts.read', 'Read Shifts', 'View operational shifts'),
  ('perm-shf-o', 'shifts.open', 'Open Shifts', 'Open operational shifts'),
  ('perm-shf-c', 'shifts.close', 'Close Shifts', 'Close operational shifts'),
  ('perm-rdg-r', 'meter_readings.read', 'Read Meter Readings', 'View nozzle meter readings'),
  ('perm-rdg-w', 'meter_readings.write', 'Write Meter Readings', 'Record meter readings and unavailability');

-- Update role_permissions according to the least-privilege matrix
-- Admin: all permissions
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'ADMIN';

-- STATE_OFFICE: read-only for products/infra/shifts/meter readings
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'STATE_OFFICE' AND p.`code` IN (
  'products.read', 'outlet_products.read', 'tanks.read', 'dispensers.read',
  'nozzles.read', 'shift_templates.read', 'shifts.read', 'meter_readings.read'
);

-- DIVISIONAL_OFFICE: read-only for products/infra/shifts/meter readings
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'DIVISIONAL_OFFICE' AND p.`code` IN (
  'products.read', 'outlet_products.read', 'tanks.read', 'dispensers.read',
  'nozzles.read', 'shift_templates.read', 'shifts.read', 'meter_readings.read'
);

-- BUSINESS_MANAGER: read-only for products/infra/shifts/meter readings
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'BUSINESS_MANAGER' AND p.`code` IN (
  'products.read', 'outlet_products.read', 'tanks.read', 'dispensers.read',
  'nozzles.read', 'shift_templates.read', 'shifts.read', 'meter_readings.read'
);

-- FIELD_OFFICER: read-only for products/infra/shifts/meter readings
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'FIELD_OFFICER' AND p.`code` IN (
  'products.read', 'outlet_products.read', 'tanks.read', 'dispensers.read',
  'nozzles.read', 'shift_templates.read', 'shifts.read', 'meter_readings.read'
);

-- DEALER: full management of outlet infra, shift templates, shifts, meter readings
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'DEALER' AND p.`code` IN (
  'products.read', 'outlet_products.read', 'outlet_products.write',
  'tanks.read', 'tanks.write',
  'dispensers.read', 'dispensers.write',
  'nozzles.read', 'nozzles.write',
  'shift_templates.read', 'shift_templates.write',
  'shifts.read', 'shifts.open', 'shifts.close',
  'meter_readings.read', 'meter_readings.write'
);

-- CSP: operational readings, shifts open/close, read-only infra
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r, `permissions` p
WHERE r.`code` = 'CSP' AND p.`code` IN (
  'products.read', 'outlet_products.read',
  'tanks.read', 'dispensers.read', 'nozzles.read', 'shift_templates.read',
  'shifts.read', 'shifts.open', 'shifts.close',
  'meter_readings.read', 'meter_readings.write'
);

-- 2. Rebuild nozzle_meter_readings with scaled INTEGER milliunits only (removing legacy REAL columns)
CREATE TABLE `nozzle_meter_readings_new` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `operational_shift_id` TEXT NOT NULL,
  `outlet_id` TEXT NOT NULL,
  `nozzle_id` TEXT NOT NULL,
  `opening_totalizer_milliunits` INTEGER NOT NULL,
  `closing_totalizer_milliunits` INTEGER NOT NULL,
  `testing_quantity_milliunits` INTEGER NOT NULL DEFAULT 0,
  `gross_sales_quantity_milliunits` INTEGER NOT NULL,
  `net_sales_quantity_milliunits` INTEGER NOT NULL,
  `opening_variance_milliunits` INTEGER NOT NULL DEFAULT 0,
  `recorded_by_user_id` TEXT NOT NULL,
  `has_opening_variance` INTEGER NOT NULL DEFAULT 0,
  `variance_reason` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  UNIQUE (`operational_shift_id`, `nozzle_id`),
  FOREIGN KEY (`operational_shift_id`) REFERENCES `operational_shifts` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`nozzle_id`) REFERENCES `nozzles` (`id`),
  FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users` (`id`)
);

-- Safe backfill from existing nozzle_meter_readings table
INSERT INTO `nozzle_meter_readings_new` (
  `id`,
  `operational_shift_id`,
  `outlet_id`,
  `nozzle_id`,
  `opening_totalizer_milliunits`,
  `closing_totalizer_milliunits`,
  `testing_quantity_milliunits`,
  `gross_sales_quantity_milliunits`,
  `net_sales_quantity_milliunits`,
  `opening_variance_milliunits`,
  `recorded_by_user_id`,
  `has_opening_variance`,
  `variance_reason`,
  `created_at`,
  `updated_at`
)
SELECT
  `id`,
  `operational_shift_id`,
  `outlet_id`,
  `nozzle_id`,
  COALESCE(`opening_totalizer_milliunits`, CAST(ROUND(`opening_totalizer` * 1000) AS INTEGER)),
  COALESCE(`closing_totalizer_milliunits`, CAST(ROUND(`closing_totalizer` * 1000) AS INTEGER)),
  COALESCE(`testing_quantity_milliunits`, CAST(ROUND(COALESCE(`testing_quantity`, 0) * 1000) AS INTEGER)),
  COALESCE(`gross_sales_quantity_milliunits`, CAST(ROUND(`gross_sales_quantity` * 1000) AS INTEGER)),
  COALESCE(`net_sales_quantity_milliunits`, CAST(ROUND(`net_sales_quantity` * 1000) AS INTEGER)),
  COALESCE(`opening_variance_milliunits`, CAST(ROUND(COALESCE(`opening_variance_quantity`, 0) * 1000) AS INTEGER)),
  `recorded_by_user_id`,
  COALESCE(`has_opening_variance`, 0),
  `variance_reason`,
  `created_at`,
  `updated_at`
FROM `nozzle_meter_readings`;

DROP TABLE `nozzle_meter_readings`;
ALTER TABLE `nozzle_meter_readings_new` RENAME TO `nozzle_meter_readings`;

CREATE UNIQUE INDEX IF NOT EXISTS `idx_nmr_shift_nozzle_unique` ON `nozzle_meter_readings` (`operational_shift_id`, `nozzle_id`);
CREATE INDEX IF NOT EXISTS `idx_nmr_shift_id` ON `nozzle_meter_readings` (`operational_shift_id`);
CREATE INDEX IF NOT EXISTS `idx_nmr_nozzle_id` ON `nozzle_meter_readings` (`nozzle_id`);
CREATE INDEX IF NOT EXISTS `idx_nmr_outlet_id` ON `nozzle_meter_readings` (`outlet_id`);
