-- Migration 0001: Initial Schema for IOCL Digital Pump Manager

CREATE TABLE IF NOT EXISTS `users` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `emp_code` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `email` TEXT NOT NULL UNIQUE,
  `phone` TEXT NOT NULL,
  `password_hash` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_users_email` ON `users` (`email`);
CREATE INDEX IF NOT EXISTS `idx_users_emp_code` ON `users` (`emp_code`);
CREATE INDEX IF NOT EXISTS `idx_users_status` ON `users` (`status`);

CREATE TABLE IF NOT EXISTS `roles` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `code` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `description` TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS `permissions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `code` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `description` TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` TEXT NOT NULL,
  `permission_id` TEXT NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_rp_role_id` ON `role_permissions` (`role_id`);

CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` TEXT NOT NULL,
  `role_id` TEXT NOT NULL,
  PRIMARY KEY (`user_id`, `role_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_ur_user_id` ON `user_roles` (`user_id`);

CREATE TABLE IF NOT EXISTS `states` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `code` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS `divisions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `state_id` TEXT NOT NULL,
  `code` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  FOREIGN KEY (`state_id`) REFERENCES `states` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_divisions_state_id` ON `divisions` (`state_id`);

CREATE TABLE IF NOT EXISTS `sales_areas` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `division_id` TEXT NOT NULL,
  `code` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_sales_areas_division_id` ON `sales_areas` (`division_id`);

CREATE TABLE IF NOT EXISTS `retail_outlets` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `ro_code` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `outlet_type` TEXT NOT NULL,
  `state_id` TEXT NOT NULL,
  `division_id` TEXT NOT NULL,
  `sales_area_id` TEXT NOT NULL,
  `address` TEXT NOT NULL,
  `city` TEXT NOT NULL,
  `district` TEXT NOT NULL,
  `pincode` TEXT NOT NULL,
  `latitude` REAL,
  `longitude` REAL,
  `status` TEXT NOT NULL DEFAULT 'ACTIVE',
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  FOREIGN KEY (`state_id`) REFERENCES `states` (`id`),
  FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`),
  FOREIGN KEY (`sales_area_id`) REFERENCES `sales_areas` (`id`)
);

CREATE INDEX IF NOT EXISTS `idx_outlets_ro_code` ON `retail_outlets` (`ro_code`);
CREATE INDEX IF NOT EXISTS `idx_outlets_state_id` ON `retail_outlets` (`state_id`);
CREATE INDEX IF NOT EXISTS `idx_outlets_division_id` ON `retail_outlets` (`division_id`);
CREATE INDEX IF NOT EXISTS `idx_outlets_sales_area_id` ON `retail_outlets` (`sales_area_id`);

CREATE TABLE IF NOT EXISTS `outlet_user_assignments` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `outlet_id` TEXT NOT NULL,
  `user_id` TEXT NOT NULL,
  `assignment_type` TEXT NOT NULL,
  `effective_from` TEXT NOT NULL,
  `effective_to` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT 1,
  `created_at` TEXT NOT NULL,
  `created_by` TEXT NOT NULL,
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_oua_outlet_id` ON `outlet_user_assignments` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_oua_user_id` ON `outlet_user_assignments` (`user_id`);

CREATE TABLE IF NOT EXISTS `user_scope_assignments` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL,
  `scope_level` TEXT NOT NULL,
  `state_id` TEXT,
  `division_id` TEXT,
  `sales_area_id` TEXT,
  `outlet_id` TEXT,
  `created_at` TEXT NOT NULL,
  `created_by` TEXT NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`state_id`) REFERENCES `states` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`sales_area_id`) REFERENCES `sales_areas` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS `idx_usa_user_id` ON `user_scope_assignments` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_usa_scope_level` ON `user_scope_assignments` (`scope_level`);

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL,
  `token_hash` TEXT NOT NULL UNIQUE,
  `expires_at` TEXT NOT NULL,
  `created_at` TEXT NOT NULL,
  `last_seen_at` TEXT NOT NULL,
  `ip_address` TEXT,
  `user_agent` TEXT,
  `revoked_at` TEXT,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_sessions_user_id` ON `sessions` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_sessions_token_hash` ON `sessions` (`token_hash`);

CREATE TABLE IF NOT EXISTS `documents` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `r2_key` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `mime_type` TEXT NOT NULL,
  `size_bytes` INTEGER NOT NULL,
  `outlet_id` TEXT,
  `uploaded_by_user_id` TEXT NOT NULL,
  `created_at` TEXT NOT NULL,
  FOREIGN KEY (`outlet_id`) REFERENCES `retail_outlets` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`)
);

CREATE INDEX IF NOT EXISTS `idx_documents_outlet_id` ON `documents` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_documents_uploaded_by` ON `documents` (`uploaded_by_user_id`);

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT,
  `action` TEXT NOT NULL,
  `entity_type` TEXT NOT NULL,
  `entity_id` TEXT NOT NULL,
  `old_value_json` TEXT,
  `new_value_json` TEXT,
  `ip_address` TEXT,
  `user_agent` TEXT,
  `created_at` TEXT NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS `idx_audit_logs_user_id` ON `audit_logs` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_audit_logs_entity` ON `audit_logs` (`entity_type`, `entity_id`);
