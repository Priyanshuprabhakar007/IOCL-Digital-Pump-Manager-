-- Migration 0002: Pump Operations & Shift Foundation for IOCL Digital Pump Manager

-- 1. Product Master
CREATE TABLE IF NOT EXISTS `products` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `code` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `category` TEXT NOT NULL,
  `unit` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  CHECK (`status` IN ('ACTIVE', 'INACTIVE')),
  CHECK (`unit` IN ('LITRE', 'KG'))
);

CREATE INDEX IF NOT EXISTS `idx_products_code` ON `products` (`code`);
CREATE INDEX IF NOT EXISTS `idx_products_category` ON `products` (`category`);
CREATE INDEX IF NOT EXISTS `idx_products_status` ON `products` (`status`);

-- 2. Retail Outlet Product Mapping
CREATE TABLE IF NOT EXISTS `outlet_products` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `outlet_id` TEXT NOT NULL,
  `product_id` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `created_at` TEXT NOT NULL,
  `created_by` TEXT NOT NULL,
  UNIQUE (`outlet_id`, `product_id`),
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CHECK (`status` IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS `idx_op_outlet_id` ON `outlet_products` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_op_product_id` ON `outlet_products` (`product_id`);

-- 3. Underground Tank Master
CREATE TABLE IF NOT EXISTS `tanks` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `outlet_id` TEXT NOT NULL,
  `tank_number` INTEGER NOT NULL,
  `name` TEXT NOT NULL,
  `product_id` TEXT NOT NULL,
  `capacity_litres` REAL NOT NULL,
  `safe_fill_capacity_litres` REAL NOT NULL,
  `minimum_operating_level_litres` REAL NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `commissioned_at` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  `created_by` TEXT NOT NULL,
  UNIQUE (`outlet_id`, `tank_number`),
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CHECK (`capacity_litres` > 0),
  CHECK (`safe_fill_capacity_litres` <= `capacity_litres`),
  CHECK (`minimum_operating_level_litres` >= 0),
  CHECK (`status` IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'))
);

CREATE INDEX IF NOT EXISTS `idx_tanks_outlet_id` ON `tanks` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_tanks_product_id` ON `tanks` (`product_id`);

-- 4. Dispenser Master
CREATE TABLE IF NOT EXISTS `dispensers` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `outlet_id` TEXT NOT NULL,
  `dispenser_number` INTEGER NOT NULL,
  `name` TEXT NOT NULL,
  `manufacturer` TEXT,
  `model` TEXT,
  `serial_number` TEXT,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `commissioned_at` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  `created_by` TEXT NOT NULL,
  UNIQUE (`outlet_id`, `dispenser_number`),
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CHECK (`status` IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'))
);

CREATE INDEX IF NOT EXISTS `idx_dispensers_outlet_id` ON `dispensers` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_dispensers_serial` ON `dispensers` (`serial_number`);

-- 5. Nozzle Master
CREATE TABLE IF NOT EXISTS `nozzles` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `outlet_id` TEXT NOT NULL,
  `dispenser_id` TEXT NOT NULL,
  `nozzle_number` INTEGER NOT NULL,
  `product_id` TEXT NOT NULL,
  `tank_id` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  `created_by` TEXT NOT NULL,
  UNIQUE (`dispenser_id`, `nozzle_number`),
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`dispenser_id`) REFERENCES `dispensers` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  FOREIGN KEY (`tank_id`) REFERENCES `tanks` (`id`),
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CHECK (`status` IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'))
);

CREATE INDEX IF NOT EXISTS `idx_nozzles_outlet_id` ON `nozzles` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_nozzles_dispenser_id` ON `nozzles` (`dispenser_id`);
CREATE INDEX IF NOT EXISTS `idx_nozzles_tank_id` ON `nozzles` (`tank_id`);
CREATE INDEX IF NOT EXISTS `idx_nozzles_product_id` ON `nozzles` (`product_id`);

-- 6. Shift Configuration Template
CREATE TABLE IF NOT EXISTS `shift_templates` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `outlet_id` TEXT NOT NULL,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `start_time` TEXT NOT NULL,
  `end_time` TEXT NOT NULL,
  `sequence` INTEGER NOT NULL DEFAULT 1,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  `created_by` TEXT NOT NULL,
  UNIQUE (`outlet_id`, `code`),
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CHECK (`status` IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS `idx_shift_templates_outlet_id` ON `shift_templates` (`outlet_id`);

-- 7. Operational Shift Instance
CREATE TABLE IF NOT EXISTS `operational_shifts` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `outlet_id` TEXT NOT NULL,
  `shift_template_id` TEXT NOT NULL,
  `business_date` TEXT NOT NULL,
  `started_at` TEXT NOT NULL,
  `closed_at` TEXT,
  `status` TEXT NOT NULL DEFAULT 'OPEN',
  `opened_by_user_id` TEXT NOT NULL,
  `closed_by_user_id` TEXT,
  `notes` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  UNIQUE (`outlet_id`, `shift_template_id`, `business_date`),
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`shift_template_id`) REFERENCES `shift_templates` (`id`),
  FOREIGN KEY (`opened_by_user_id`) REFERENCES `users` (`id`),
  FOREIGN KEY (`closed_by_user_id`) REFERENCES `users` (`id`),
  CHECK (`status` IN ('OPEN', 'CLOSED', 'LOCKED'))
);

CREATE INDEX IF NOT EXISTS `idx_op_shifts_outlet_id` ON `operational_shifts` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_op_shifts_business_date` ON `operational_shifts` (`business_date`);
CREATE INDEX IF NOT EXISTS `idx_op_shifts_status` ON `operational_shifts` (`status`);

-- 8. Nozzle Meter Readings
CREATE TABLE IF NOT EXISTS `nozzle_meter_readings` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `operational_shift_id` TEXT NOT NULL,
  `outlet_id` TEXT NOT NULL,
  `nozzle_id` TEXT NOT NULL,
  `opening_totalizer` REAL NOT NULL,
  `closing_totalizer` REAL NOT NULL,
  `testing_quantity` REAL NOT NULL DEFAULT 0,
  `gross_sales_quantity` REAL NOT NULL,
  `net_sales_quantity` REAL NOT NULL,
  `recorded_by_user_id` TEXT NOT NULL,
  `has_opening_variance` INTEGER NOT NULL DEFAULT 0,
  `opening_variance_quantity` REAL DEFAULT 0,
  `variance_reason` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  UNIQUE (`operational_shift_id`, `nozzle_id`),
  FOREIGN KEY (`operational_shift_id`) REFERENCES `operational_shifts` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`nozzle_id`) REFERENCES `nozzles` (`id`),
  FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users` (`id`),
  CHECK (`closing_totalizer` >= `opening_totalizer`),
  CHECK (`testing_quantity` >= 0),
  CHECK (`testing_quantity` <= `gross_sales_quantity`),
  CHECK (`net_sales_quantity` >= 0)
);

CREATE INDEX IF NOT EXISTS `idx_nmr_shift_id` ON `nozzle_meter_readings` (`operational_shift_id`);
CREATE INDEX IF NOT EXISTS `idx_nmr_nozzle_id` ON `nozzle_meter_readings` (`nozzle_id`);
CREATE INDEX IF NOT EXISTS `idx_nmr_outlet_id` ON `nozzle_meter_readings` (`outlet_id`);

-- 9. Nozzle Unavailability Records
CREATE TABLE IF NOT EXISTS `nozzle_unavailability_records` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `operational_shift_id` TEXT NOT NULL,
  `nozzle_id` TEXT NOT NULL,
  `reason` TEXT NOT NULL,
  `recorded_by` TEXT NOT NULL,
  `created_at` TEXT NOT NULL,
  UNIQUE (`operational_shift_id`, `nozzle_id`),
  FOREIGN KEY (`operational_shift_id`) REFERENCES `operational_shifts` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`nozzle_id`) REFERENCES `nozzles` (`id`),
  FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)
);

CREATE INDEX IF NOT EXISTS `idx_nur_shift_id` ON `nozzle_unavailability_records` (`operational_shift_id`);
CREATE INDEX IF NOT EXISTS `idx_nur_nozzle_id` ON `nozzle_unavailability_records` (`nozzle_id`);
