import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

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
  uniqueIndex('idx_dispensers_serial_number_unique').on(table.serialNumber).where(sql`serial_number IS NOT NULL`),
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
  status: text('status', { enum: ['OPEN', 'CLOSING', 'CLOSED', 'LOCKED'] }).notNull().default('OPEN'),
  openedByUserId: text('opened_by_user_id').notNull().references(() => users.id),
  closedByUserId: text('closed_by_user_id').references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_op_shifts_unique').on(table.outletId, table.shiftTemplateId, table.businessDate),
  uniqueIndex('idx_operational_shifts_single_active').on(table.outletId).where(sql`status IN ('OPEN', 'CLOSING')`),
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
  openingTotalizerMilliunits: integer('opening_totalizer_milliunits').notNull(),
  closingTotalizerMilliunits: integer('closing_totalizer_milliunits').notNull(),
  testingQuantityMilliunits: integer('testing_quantity_milliunits').notNull().default(0),
  grossSalesQuantityMilliunits: integer('gross_sales_quantity_milliunits').notNull(),
  netSalesQuantityMilliunits: integer('net_sales_quantity_milliunits').notNull(),
  openingVarianceMilliunits: integer('opening_variance_milliunits').notNull().default(0),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  hasOpeningVariance: integer('has_opening_variance', { mode: 'boolean' }).notNull().default(false),
  varianceReason: text('variance_reason'),
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

// ==========================================
// Phase 2B: Tank Stock, Calibration, Fuel Receipt & Reconciliation
// ==========================================

export const tankCalibrationPoints = sqliteTable('tank_calibration_points', {
  id: text('id').primaryKey(),
  tankId: text('tank_id').notNull().references(() => tanks.id, { onDelete: 'cascade' }),
  dipMillimetresMilliunits: integer('dip_millimetres_milliunits').notNull(),
  volumeMilliunits: integer('volume_milliunits').notNull(),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_tcp_tank_dip').on(table.tankId, table.dipMillimetresMilliunits),
  index('idx_tcp_tank_id').on(table.tankId),
]);

export const operationalShiftTanks = sqliteTable('operational_shift_tanks', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  tankNumber: integer('tank_number').notNull(),
  tankName: text('tank_name').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  productCode: text('product_code').notNull(),
  productName: text('product_name').notNull(),
  productUnit: text('product_unit').notNull().default('LITRE'),
  capacityMilliunits: integer('capacity_milliunits').notNull(),
  safeFillCapacityMilliunits: integer('safe_fill_capacity_milliunits').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_ost_shift_tank').on(table.operationalShiftId, table.tankId),
  index('idx_ost_shift_id').on(table.operationalShiftId),
  index('idx_ost_outlet_id').on(table.outletId),
]);

export const tankStockReadings = sqliteTable('tank_stock_readings', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  productId: text('product_id').notNull().references(() => products.id),
  readingType: text('reading_type', { enum: ['OPENING', 'CLOSING', 'PRE_RECEIPT', 'POST_RECEIPT', 'ADHOC'] }).notNull(),
  source: text('source', { enum: ['MANUAL', 'ATG'] }).notNull(),
  productDipMmMilliunits: integer('product_dip_mm_milliunits').notNull(),
  waterDipMmMilliunits: integer('water_dip_mm_milliunits').notNull().default(0),
  grossObservedVolumeMilliunits: integer('gross_observed_volume_milliunits').notNull(),
  waterVolumeMilliunits: integer('water_volume_milliunits').notNull().default(0),
  netProductVolumeMilliunits: integer('net_product_volume_milliunits').notNull(),
  recordedAt: text('recorded_at').notNull(),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_tsr_single_opening').on(table.operationalShiftId, table.tankId).where(sql`reading_type = 'OPENING'`),
  uniqueIndex('idx_tsr_single_closing').on(table.operationalShiftId, table.tankId).where(sql`reading_type = 'CLOSING'`),
  index('idx_tsr_shift_id').on(table.operationalShiftId),
  index('idx_tsr_outlet_id').on(table.outletId),
  index('idx_tsr_tank_id').on(table.tankId),
]);

export const fuelReceipts = sqliteTable('fuel_receipts', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  ttNumber: text('tt_number').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  invoiceDate: text('invoice_date').notNull(),
  arrivalAt: text('arrival_at').notNull(),
  decantationStartedAt: text('decantation_started_at'),
  decantationCompletedAt: text('decantation_completed_at'),
  sealVerified: integer('seal_verified', { mode: 'boolean' }).notNull().default(true),
  sealExceptionReason: text('seal_exception_reason'),
  status: text('status', { enum: ['ARRIVED', 'VERIFIED', 'DECANTED', 'COMPLETED', 'CANCELLED'] }).notNull().default('ARRIVED'),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_fr_outlet_id').on(table.outletId),
  index('idx_fr_shift_id').on(table.operationalShiftId),
]);

export const fuelReceiptTankLines = sqliteTable('fuel_receipt_tank_lines', {
  id: text('id').primaryKey(),
  fuelReceiptId: text('fuel_receipt_id').notNull().references(() => fuelReceipts.id, { onDelete: 'cascade' }),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  productId: text('product_id').notNull().references(() => products.id),
  invoiceQuantityMilliunits: integer('invoice_quantity_milliunits').notNull(),
  preDecantReadingId: text('pre_decant_reading_id').references(() => tankStockReadings.id),
  postDecantReadingId: text('post_decant_reading_id').references(() => tankStockReadings.id),
  measuredReceivedQuantityMilliunits: integer('measured_received_quantity_milliunits'),
  receiptVarianceMilliunits: integer('receipt_variance_milliunits'),
  densityMilliunits: integer('density_milliunits'),
  temperatureMilliunits: integer('temperature_milliunits'),
  invoiceDensityMilliunits: integer('invoice_density_milliunits'),
  densityVarianceMilliunits: integer('density_variance_milliunits'),
  qualityStatus: text('quality_status', { enum: ['PASS', 'OUT_OF_TOLERANCE', 'NOT_EVALUATED'] }).notNull().default('NOT_EVALUATED'),
  appliedToleranceSettingId: text('applied_tolerance_setting_id').references(() => qualityToleranceSettings.id),
  appliedDensityToleranceMilliunits: integer('applied_density_tolerance_milliunits'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_frtl_unique_pre_reading').on(table.preDecantReadingId).where(sql`pre_decant_reading_id IS NOT NULL`),
  uniqueIndex('idx_frtl_unique_post_reading').on(table.postDecantReadingId).where(sql`post_decant_reading_id IS NOT NULL`),
  index('idx_frtl_receipt_id').on(table.fuelReceiptId),
  index('idx_frtl_tank_id').on(table.tankId),
]);

export const qualityToleranceSettings = sqliteTable('quality_tolerance_settings', {
  id: text('id').primaryKey(),
  scopeType: text('scope_type', { enum: ['GLOBAL', 'STATE', 'DIVISION', 'OUTLET'] }).notNull(),
  scopeEntityId: text('scope_entity_id'),
  productId: text('product_id').references(() => products.id),
  densityToleranceMilliunits: integer('density_tolerance_milliunits').notNull(),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  index('idx_qts_scope').on(table.scopeType, table.scopeEntityId),
  index('idx_qts_product').on(table.productId),
]);

export const shiftStockReconciliations = sqliteTable('shift_stock_reconciliations', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id, { onDelete: 'cascade' }),
  tankId: text('tank_id').notNull().references(() => tanks.id),
  productId: text('product_id').notNull().references(() => products.id),
  openingStockMilliunits: integer('opening_stock_milliunits').notNull(),
  receiptQuantityMilliunits: integer('receipt_quantity_milliunits').notNull().default(0),
  salesQuantityMilliunits: integer('sales_quantity_milliunits').notNull().default(0),
  theoreticalClosingStockMilliunits: integer('theoretical_closing_stock_milliunits').notNull(),
  physicalClosingStockMilliunits: integer('physical_closing_stock_milliunits').notNull(),
  varianceMilliunits: integer('variance_milliunits').notNull(),
  varianceStatus: text('variance_status', { enum: ['GAIN', 'LOSS', 'BALANCED'] }).notNull(),
  calculatedAt: text('calculated_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_ssr_shift_tank').on(table.operationalShiftId, table.tankId),
  index('idx_ssr_shift_id').on(table.operationalShiftId),
  index('idx_ssr_outlet_id').on(table.outletId),
]);

export const outletProductPrices = sqliteTable('outlet_product_prices', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  productId: text('product_id').notNull().references(() => products.id),
  pricePaisePerUnit: integer('price_paise_per_unit').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  index('idx_opp_outlet_product').on(table.outletId, table.productId),
]);

export const operationalShiftProductPrices = sqliteTable('operational_shift_product_prices', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  productId: text('product_id').notNull().references(() => products.id),
  productCode: text('product_code').notNull(),
  productName: text('product_name').notNull(),
  unit: text('unit').notNull(),
  productCategory: text('product_category'),
  pricePaisePerUnit: integer('price_paise_per_unit').notNull(),
  sourcePriceId: text('source_price_id').notNull().references(() => outletProductPrices.id),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_shift_product_price').on(table.operationalShiftId, table.productId),
  index('idx_ospp_shift').on(table.operationalShiftId),
]);

export const creditParties = sqliteTable('credit_parties', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  partyCode: text('party_code').notNull(),
  partyName: text('party_name').notNull(),
  contactName: text('contact_name'),
  phone: text('phone'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] }).notNull().default('ACTIVE'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
}, (table) => [
  uniqueIndex('idx_outlet_party_code').on(table.outletId, table.partyCode),
  index('idx_cp_outlet_status').on(table.outletId, table.status),
]);

export const shiftCollections = sqliteTable('shift_collections', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  collectionType: text('collection_type', { enum: ['CASH', 'POS_CARD', 'UPI', 'FLEET_CARD', 'CREDIT_SALE', 'DIRECT_BANK_DROP'] }).notNull(),
  amountPaise: integer('amount_paise').notNull(),
  provider: text('provider'),
  referenceNumber: text('reference_number'),
  creditPartyId: text('credit_party_id').references(() => creditParties.id),
  creditPartyCodeSnapshot: text('credit_party_code_snapshot'),
  creditPartyNameSnapshot: text('credit_party_name_snapshot'),
  collectedAt: text('collected_at').notNull(),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_sc_shift_outlet').on(table.operationalShiftId, table.outletId),
]);

export const cashHandoverLogs = sqliteTable('cash_handover_logs', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  amountPaise: integer('amount_paise').notNull(),
  handedOverByUserId: text('handed_over_by_user_id').notNull().references(() => users.id),
  receivedByUserId: text('received_by_user_id').references(() => users.id),
  handedOverAt: text('handed_over_at').notNull(),
  receivedAt: text('received_at'),
  status: text('status', { enum: ['PENDING', 'ACKNOWLEDGED', 'DISPUTED'] }).notNull().default('PENDING'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_chl_shift_outlet').on(table.operationalShiftId, table.outletId),
]);

export const bankDeposits = sqliteTable('bank_deposits', {
  id: text('id').primaryKey(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  depositChannel: text('deposit_channel', { enum: ['BANK_BRANCH', 'CASH_DROP_BOX'] }).notNull(),
  amountPaise: integer('amount_paise').notNull(),
  depositDate: text('deposit_date').notNull(),
  referenceNumber: text('reference_number'),
  documentId: text('document_id').references(() => documents.id),
  status: text('status', { enum: ['SUBMITTED', 'VERIFIED', 'REJECTED'] }).notNull().default('SUBMITTED'),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  verifiedByUserId: text('verified_by_user_id').references(() => users.id),
  verifiedAt: text('verified_at'),
  rejectionReason: text('rejection_reason'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_bd_shift_outlet_status').on(table.operationalShiftId, table.outletId, table.status),
]);

export const shiftFinancialReconciliations = sqliteTable('shift_financial_reconciliations', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id).unique(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  fuelSalesRevenuePaise: integer('fuel_sales_revenue_paise').notNull(),
  cngSalesRevenuePaise: integer('cng_sales_revenue_paise'),
  lubeSalesRevenuePaise: integer('lube_sales_revenue_paise'),
  authoritativeSalesRevenuePaise: integer('authoritative_sales_revenue_paise').notNull(),
  cashCollectionPaise: integer('cash_collection_paise').notNull(),
  posCollectionPaise: integer('pos_collection_paise').notNull(),
  upiCollectionPaise: integer('upi_collection_paise').notNull(),
  fleetCardCollectionPaise: integer('fleet_card_collection_paise').notNull(),
  creditSalesPaise: integer('credit_sales_paise').notNull(),
  directBankDropPaise: integer('direct_bank_drop_paise').notNull(),
  totalCollectionsPaise: integer('total_collections_paise').notNull(),
  salesCollectionVariancePaise: integer('sales_collection_variance_paise').notNull(),
  varianceStatus: text('variance_status', { enum: ['BALANCED', 'SHORTAGE', 'EXCESS'] }).notNull(),
  varianceReason: text('variance_reason'),
  calculatedAt: text('calculated_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const cngShiftLogs = sqliteTable('cng_shift_logs', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id).unique(),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  mfmOpeningKgMilliunits: integer('mfm_opening_kg_milliunits').notNull(),
  mfmClosingKgMilliunits: integer('mfm_closing_kg_milliunits').notNull(),
  netSalesKgMilliunits: integer('net_sales_kg_milliunits').notNull(),
  gridIntakeKgMilliunits: integer('grid_intake_kg_milliunits'),
  gridSalesVarianceKgMilliunits: integer('grid_sales_variance_kg_milliunits'),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_cng_shift_logs_outlet_id').on(table.outletId),
  index('idx_cng_shift_logs_shift_id').on(table.operationalShiftId),
  check('mfm_opening_kg_milliunits_check', sql`${table.mfmOpeningKgMilliunits} >= 0`),
  check('mfm_closing_kg_milliunits_check', sql`${table.mfmClosingKgMilliunits} >= ${table.mfmOpeningKgMilliunits}`),
  check('net_sales_kg_milliunits_check', sql`${table.netSalesKgMilliunits} = ${table.mfmClosingKgMilliunits} - ${table.mfmOpeningKgMilliunits}`),
  check('grid_consistency_check', sql`
    (${table.gridIntakeKgMilliunits} IS NULL AND ${table.gridSalesVarianceKgMilliunits} IS NULL) OR
    (${table.gridIntakeKgMilliunits} IS NOT NULL AND ${table.gridIntakeKgMilliunits} >= 0 AND ${table.gridSalesVarianceKgMilliunits} = ${table.gridIntakeKgMilliunits} - ${table.netSalesKgMilliunits})
  `),
]);

export const cngPressureReadings = sqliteTable('cng_pressure_readings', {
  id: text('id').primaryKey(),
  operationalShiftId: text('operational_shift_id').notNull().references(() => operationalShifts.id),
  outletId: text('outlet_id').notNull().references(() => retailOutlets.id),
  recordedAt: text('recorded_at').notNull(),
  pressureUnit: text('pressure_unit').notNull(),
  suctionPressureMilliunits: integer('suction_pressure_milliunits'),
  dischargePressureMilliunits: integer('discharge_pressure_milliunits'),
  cascadePressureMilliunits: integer('cascade_pressure_milliunits'),
  recordedByUserId: text('recorded_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_cng_pressure_readings_shift_at').on(table.operationalShiftId, table.recordedAt),
  index('idx_cng_pressure_readings_outlet_at').on(table.outletId, table.recordedAt),
  check('suction_pressure_milliunits_check', sql`${table.suctionPressureMilliunits} IS NULL OR ${table.suctionPressureMilliunits} >= 0`),
  check('discharge_pressure_milliunits_check', sql`${table.dischargePressureMilliunits} IS NULL OR ${table.dischargePressureMilliunits} >= 0`),
  check('cascade_pressure_milliunits_check', sql`${table.cascadePressureMilliunits} IS NULL OR ${table.cascadePressureMilliunits} >= 0`),
  check('at_least_one_pressure_check', sql`${table.suctionPressureMilliunits} IS NOT NULL OR ${table.dischargePressureMilliunits} IS NOT NULL OR ${table.cascadePressureMilliunits} IS NOT NULL`),
]);

