-- Migration 0007: Phase 2B Final Integrity - Rebuild operational_shifts CHECK constraint for CLOSING state

PRAGMA foreign_keys=OFF;

CREATE TABLE `operational_shifts_new` (
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
  CHECK (`status` IN ('OPEN', 'CLOSING', 'CLOSED', 'LOCKED'))
);

INSERT INTO `operational_shifts_new` SELECT * FROM `operational_shifts`;

DROP TABLE `operational_shifts`;

ALTER TABLE `operational_shifts_new` RENAME TO `operational_shifts`;

CREATE INDEX IF NOT EXISTS `idx_op_shifts_outlet_id` ON `operational_shifts` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_op_shifts_business_date` ON `operational_shifts` (`business_date`);

PRAGMA foreign_keys=ON;
