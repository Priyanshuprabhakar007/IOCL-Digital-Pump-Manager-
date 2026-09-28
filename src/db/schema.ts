import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  outletType: text('outlet_type', { enum: ['COCO', 'CODO', 'A_SITE'] }).notNull(),
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

export const userScopes = userScopeAssignments;

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

// ==========================================
// Phase 2A & Hardening: Pump Operations & Shift Foundation
// ==========================================

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  unit: text('unit', { enum: ['LITRE', 'KG'] }).notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_products_code_unique').on(table.code),
  index('idx_products_category').on(table.category),
  index('idx_products_status').on(table.status),
]);

export const outletProducts = sqliteTable('outlet_products', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_outlet_products_unique').on(table.outletId, table.productId),
  index('idx_op_outlet_id').on(table.outletId),
  index('idx_op_product_id').on(table.productId),
]);

export const tanks = sqliteTable('tanks', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  tankNumber: integer('tank_number').notNull(),
  name: text('name').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  capacityLitres: real('capacity_litres').notNull(),
  safeFillCapacityLitres: real('safe_fill_capacity_litres').notNull(),
  minimumOperatingLevelLitres: real('minimum_operating_level_litres').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'] }).notNull().default('ACTIVE'),
  commissionedAt: text('commissioned_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_tanks_outlet_tank_num').on(table.outletId, table.tankNumber),
  index('idx_tanks_outlet_id').on(table.outletId),
  index('idx_tanks_product_id').on(table.productId),
]);

export const dispensers = sqliteTable('dispensers', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  dispenserNumber: integer('dispenser_number').notNull(),
  name: text('name').notNull(),
  manufacturer: text('manufacturer'),
  model: text('model'),
  serialNumber: text('serial_number'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'] }).notNull().default('ACTIVE'),
  commissionedAt: text('commissioned_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_dispensers_outlet_disp_num').on(table.outletId, table.dispenserNumber),
  index('idx_dispensers_outlet_id').on(table.outletId),
  index('idx_dispensers_serial').on(table.serialNumber),
]);

export const nozzles = sqliteTable('nozzles', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  dispenserId: text('dispenser_id').notNull().references(() => dispensers.id, { onDelete: 'cascade' }),
  nozzleNumber: integer('nozzle_number').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_nozzles_disp_nozzle_num').on(table.dispenserId, table.nozzleNumber),
  index('idx_nozzles_outlet_id').on(table.outletId),
  index('idx_nozzles_dispenser_id').on(table.dispenserId),
  index('idx_nozzles_tank_id').on(table.tankId),
  index('idx_nozzles_product_id').on(table.productId),
]);

export const shiftTemplates = sqliteTable('shift_templates', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  sequence: integer('sequence').notNull().default(1),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_shift_templates_outlet_code').on(table.outletId, table.code),
  index('idx_shift_templates_outlet_id').on(table.outletId),
]);

export const operationalShifts = sqliteTable('operational_shifts', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  shiftTemplateId: text('shift_template_id').notNull().references(() => shiftTemplates.id),
  businessDate: text('business_date').notNull(),
  startedAt: text('started_at').notNull(),
  closedAt: text('closed_at'),
  status: text('status', { enum: ['OPEN', 'CLOSED', 'LOCKED'] }).notNull().default('OPEN'),
  openedByUserId: text('opened_by_user_id').notNull().references(() => users.id),
  closedByUserId: text('closed_by_user_id').references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_op_shifts_unique').on(table.outletId, table.shiftTemplateId, table.businessDate),
  index('idx_op_shifts_outlet_id').on(table.outletId),
  index('idx_op_shifts_business_date').on(table.businessDate),
  index('idx_op_shifts_status').on(table.status),
]);

// Phase 2A Hardening: Historical Shift Nozzles Snapshot
export const operationalShiftNozzles = sqliteTable('operational_shift_nozzles', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  nozzleId: text('nozzle_id').notNull().references(() => nozzles.id),
  dispenserId: text('dispenser_id').notNull().references(() => dispensers.id),
  dispenserNumber: integer('dispenser_number').notNull(),
  dispenserName: text('dispenser_name').notNull(),
  nozzleNumber: integer('nozzle_number').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  productCode: text('product_code').notNull(),
  productName: text('product_name').notNull(),
  productCategory: text('product_category').notNull(),
  productUnit: text('product_unit').notNull(),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  tankNumber: integer('tank_number').notNull(),
  snapshotStatus: text('snapshot_status').notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_osn_shift_nozzle_unique').on(table.operationalShiftId, table.nozzleId),
  index('idx_osn_shift_id').on(table.operationalShiftId),
  index('idx_osn_outlet_id').on(table.outletId),
  index('idx_osn_nozzle_id').on(table.nozzleId),
]);

export const nozzleMeterReadings = sqliteTable('nozzle_meter_readings', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  nozzleId: text('nozzle_id').notNull().references(() => nozzles.id),
  openingTotalizer: real('opening_totalizer').notNull(),
  closingTotalizer: real('closing_totalizer').notNull(),
  testingQuantity: real('testing_quantity').notNull().default(0),
  grossSalesQuantity: real('gross_sales_quantity').notNull(),
  netSalesQuantity: real('net_sales_quantity').notNull(),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  hasOpeningVariance: integer('has_opening_variance', { mode: 'boolean' }).notNull().default(false),
  openingVarianceQuantity: real('opening_variance_quantity').default(0),
  varianceReason: text('variance_reason'),
  // Exact 3-decimal integer milliunits
  openingTotalizerMilliunits: integer('opening_totalizer_milliunits'),
  closingTotalizerMilliunits: integer('closing_totalizer_milliunits'),
  testingQuantityMilliunits: integer('testing_quantity_milliunits').default(0),
  grossSalesQuantityMilliunits: integer('gross_sales_quantity_milliunits'),
  netSalesQuantityMilliunits: integer('net_sales_quantity_milliunits'),
  openingVarianceMilliunits: integer('opening_variance_milliunits').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_nmr_shift_nozzle_unique').on(table.operationalShiftId, table.nozzleId),
  index('idx_nmr_shift_id').on(table.operationalShiftId),
  index('idx_nmr_nozzle_id').on(table.nozzleId),
  index('idx_nmr_outlet_id').on(table.outletId),
]);

export const nozzleUnavailabilityRecords = sqliteTable('nozzle_unavailability_records', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  nozzleId: text('nozzle_id').notNull().references(() => nozzles.id),
  reason: text('reason').notNull(),
  recordedBy: text('recorded_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_nur_shift_nozzle_unique').on(table.operationalShiftId, table.nozzleId),
  index('idx_nur_shift_id').on(table.operationalShiftId),
  index('idx_nur_nozzle_id').on(table.nozzleId),
]);
