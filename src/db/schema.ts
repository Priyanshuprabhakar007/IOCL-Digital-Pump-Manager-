import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  empCode: text('emp_code').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  passwordHash: text('password_hash').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_users_email').on(table.email),
  index('idx_users_emp_code').on(table.empCode),
  index('idx_users_status').on(table.status),
]);

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
});

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
});

export const rolePermissions = sqliteTable('role_permissions', {
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: text('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionId] }),
  index('idx_rp_role_id').on(table.roleId),
]);

export const userRoles = sqliteTable('user_roles', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.userId, table.roleId] }),
  index('idx_ur_user_id').on(table.userId),
]);

export const states = sqliteTable('states', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const divisions = sqliteTable('divisions', {
  id: text('id').primaryKey(),
  stateId: text('state_id').notNull().references(() => states.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_divisions_state_id').on(table.stateId),
]);

export const salesAreas = sqliteTable('sales_areas', {
  id: text('id').primaryKey(),
  divisionId: text('division_id').notNull().references(() => divisions.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_sales_areas_division_id').on(table.divisionId),
]);

export const retailOutlets = sqliteTable('retail_outlets', {
  id: text('id').primaryKey(),
  roCode: text('ro_code').notNull().unique(),
  name: text('name').notNull(),
  outletType: text('outlet_type', { enum: ['COCO', 'DOCO', 'DODO'] }).notNull(),
  stateId: text('state_id').notNull().references(() => states.id),
  divisionId: text('division_id').notNull().references(() => divisions.id),
  salesAreaId: text('sales_area_id').notNull().references(() => salesAreas.id),
  address: text('address').notNull(),
  city: text('city').notNull(),
  district: text('district').notNull(),
  pincode: text('pincode').notNull(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_outlets_ro_code').on(table.roCode),
  index('idx_outlets_state_id').on(table.stateId),
  index('idx_outlets_division_id').on(table.divisionId),
  index('idx_outlets_sales_area_id').on(table.salesAreaId),
]);

export const outletUserAssignments = sqliteTable('outlet_user_assignments', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignmentType: text('assignment_type', { enum: ['DEALER', 'CSP', 'INSPECTOR'] }).notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
}, (table) => [
  index('idx_oua_outlet_id').on(table.outletId),
  index('idx_oua_user_id').on(table.userId),
]);

export const userScopeAssignments = sqliteTable('user_scope_assignments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scopeLevel: text('scope_level', { enum: ['GLOBAL', 'STATE', 'DIVISION', 'SALES_AREA', 'OUTLET'] }).notNull(),
  stateId: text('state_id').references(() => states.id, { onDelete: 'set null' }),
  divisionId: text('division_id').references(() => divisions.id, { onDelete: 'set null' }),
  salesAreaId: text('sales_area_id').references(() => salesAreas.id, { onDelete: 'set null' }),
  outletId: text('outlet_id').references(() => retailOutlets.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
}, (table) => [
  index('idx_usa_user_id').on(table.userId),
  index('idx_usa_scope_level').on(table.scopeLevel),
]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  revokedAt: text('revoked_at'),
}, (table) => [
  index('idx_sessions_user_id').on(table.userId),
  index('idx_sessions_token_hash').on(table.tokenHash),
]);

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  r2Key: text('r2_key').notNull().unique(),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  outletId: text('outlet_id').references(() => retailOutlets.id, { onDelete: 'set null' }),
  uploadedByUserId: text('uploaded_by_user_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_documents_outlet_id').on(table.outletId),
  index('idx_documents_uploaded_by').on(table.uploadedByUserId),
]);

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  oldValueJson: text('old_value_json'),
  newValueJson: text('new_value_json'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_audit_logs_user_id').on(table.userId),
  index('idx_audit_logs_entity').on(table.entityType, table.entityId),
]);
