-- Migration 0008: Phase 2B Lock & Transaction Integrity - Recreate partial unique index for OPEN/CLOSING and status index

CREATE UNIQUE INDEX IF NOT EXISTS `idx_operational_shifts_single_active` ON `operational_shifts` (`outlet_id`) WHERE `status` IN ('OPEN', 'CLOSING');
CREATE INDEX IF NOT EXISTS `idx_op_shifts_status` ON `operational_shifts` (`status`);
