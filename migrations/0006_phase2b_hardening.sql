-- Migration 0006: Phase 2B Hardening - Unique Reading Partial Indexes, Applied Tolerance Columns & Status Constraints

-- 1. Partial Unique Indexes on fuel_receipt_tank_lines to prevent reading reuse
CREATE UNIQUE INDEX IF NOT EXISTS `idx_frtl_unique_pre_reading` 
ON `fuel_receipt_tank_lines` (`pre_decant_reading_id`) 
WHERE `pre_decant_reading_id` IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `idx_frtl_unique_post_reading` 
ON `fuel_receipt_tank_lines` (`post_decant_reading_id`) 
WHERE `post_decant_reading_id` IS NOT NULL;

-- 2. Add columns to persist applied quality tolerance settings on fuel receipt lines for historical explainability
ALTER TABLE `fuel_receipt_tank_lines` ADD COLUMN `applied_tolerance_setting_id` TEXT REFERENCES `quality_tolerance_settings`(`id`);
ALTER TABLE `fuel_receipt_tank_lines` ADD COLUMN `applied_density_tolerance_milliunits` INTEGER;
