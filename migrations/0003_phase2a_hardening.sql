-- Migration 0003: Phase 2A Hardening & Historical Shift Snapshots for IOCL Digital Pump Manager

-- 1. Historical Shift Snapshot Table
CREATE TABLE IF NOT EXISTS `operational_shift_nozzles` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `operational_shift_id` TEXT NOT NULL,
  `outlet_id` TEXT NOT NULL,
  `nozzle_id` TEXT NOT NULL,
  `dispenser_id` TEXT NOT NULL,
  `dispenser_number` INTEGER NOT NULL,
  `dispenser_name` TEXT NOT NULL,
  `nozzle_number` INTEGER NOT NULL,
  `product_id` TEXT NOT NULL,
  `product_code` TEXT NOT NULL,
  `product_name` TEXT NOT NULL,
  `product_category` TEXT NOT NULL,
  `product_unit` TEXT NOT NULL,
  `tank_id` TEXT NOT NULL,
  `tank_number` INTEGER NOT NULL,
  `snapshot_status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `created_at` TEXT NOT NULL,
  UNIQUE (`operational_shift_id`, `nozzle_id`),
  FOREIGN KEY (`operational_shift_id`) REFERENCES `operational_shifts` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`nozzle_id`) REFERENCES `nozzles` (`id`),
  FOREIGN KEY (`dispenser_id`) REFERENCES `dispensers` (`id`),
  FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  FOREIGN KEY (`tank_id`) REFERENCES `tanks` (`id`)
);

CREATE INDEX IF NOT EXISTS `idx_osn_shift_id` ON `operational_shift_nozzles` (`operational_shift_id`);
CREATE INDEX IF NOT EXISTS `idx_osn_outlet_id` ON `operational_shift_nozzles` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_osn_nozzle_id` ON `operational_shift_nozzles` (`nozzle_id`);

-- 2. Unique constraint: Only one OPEN shift per outlet at a time
CREATE UNIQUE INDEX IF NOT EXISTS `idx_operational_shifts_single_open` 
ON `operational_shifts` (`outlet_id`) 
WHERE `status` = 'OPEN';

-- 3. Unique constraint for dispenser serial numbers (when not null)
CREATE UNIQUE INDEX IF NOT EXISTS `idx_dispensers_serial_number_unique` 
ON `dispensers` (`serial_number`) 
WHERE `serial_number` IS NOT NULL;

-- 4. Scaled integer columns (milliunits) for meter readings
ALTER TABLE `nozzle_meter_readings` ADD COLUMN `opening_totalizer_milliunits` INTEGER;
ALTER TABLE `nozzle_meter_readings` ADD COLUMN `closing_totalizer_milliunits` INTEGER;
ALTER TABLE `nozzle_meter_readings` ADD COLUMN `testing_quantity_milliunits` INTEGER DEFAULT 0;
ALTER TABLE `nozzle_meter_readings` ADD COLUMN `gross_sales_quantity_milliunits` INTEGER;
ALTER TABLE `nozzle_meter_readings` ADD COLUMN `net_sales_quantity_milliunits` INTEGER;
ALTER TABLE `nozzle_meter_readings` ADD COLUMN `opening_variance_milliunits` INTEGER DEFAULT 0;

-- Backfill milliunits from existing records if any exist
UPDATE `nozzle_meter_readings` 
SET 
  `opening_totalizer_milliunits` = CAST(ROUND(`opening_totalizer` * 1000) AS INTEGER),
  `closing_totalizer_milliunits` = CAST(ROUND(`closing_totalizer` * 1000) AS INTEGER),
  `testing_quantity_milliunits` = CAST(ROUND(COALESCE(`testing_quantity`, 0) * 1000) AS INTEGER),
  `gross_sales_quantity_milliunits` = CAST(ROUND(`gross_sales_quantity` * 1000) AS INTEGER),
  `net_sales_quantity_milliunits` = CAST(ROUND(`net_sales_quantity` * 1000) AS INTEGER),
  `opening_variance_milliunits` = CAST(ROUND(COALESCE(`opening_variance_quantity`, 0) * 1000) AS INTEGER)
WHERE `opening_totalizer_milliunits` IS NULL;
