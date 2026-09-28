export const ROLES = {
  ADMIN: 'ADMIN',
  STATE_OFFICE: 'STATE_OFFICE',
  DIVISIONAL_OFFICE: 'DIVISIONAL_OFFICE',
  BUSINESS_MANAGER: 'BUSINESS_MANAGER',
  FIELD_OFFICER: 'FIELD_OFFICER',
  DEALER: 'DEALER',
  CSP: 'CSP',
} as const;

export type RoleCode = keyof typeof ROLES;

export const SCOPE_LEVELS = {
  GLOBAL: 'GLOBAL',
  STATE: 'STATE',
  DIVISION: 'DIVISION',
  SALES_AREA: 'SALES_AREA',
  OUTLET: 'OUTLET',
} as const;

export type ScopeLevel = keyof typeof SCOPE_LEVELS;

export const PERMISSIONS = {
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',

  HIERARCHY_READ: 'hierarchy.read',
  HIERARCHY_WRITE: 'hierarchy.write',

  OUTLETS_READ: 'outlets.read',
  OUTLETS_CREATE: 'outlets.create',
  OUTLETS_UPDATE: 'outlets.update',

  SCOPES_READ: 'scopes.read',
  SCOPES_ASSIGN: 'scopes.assign',

  DOCUMENTS_READ: 'documents.read',
  DOCUMENTS_WRITE: 'documents.write',

  AUDIT_READ: 'audit.read',

  // Phase 2A Hardened: Granular Products
  PRODUCTS_READ: 'products.read',
  PRODUCTS_MANAGE_GLOBAL: 'products.manage_global',
  OUTLET_PRODUCTS_READ: 'outlet_products.read',
  OUTLET_PRODUCTS_WRITE: 'outlet_products.write',

  // Phase 2A Hardened: Tanks
  TANKS_READ: 'tanks.read',
  TANKS_WRITE: 'tanks.write',

  // Phase 2A Hardened: Dispensers
  DISPENSERS_READ: 'dispensers.read',
  DISPENSERS_WRITE: 'dispensers.write',

  // Phase 2A Hardened: Nozzles
  NOZZLES_READ: 'nozzles.read',
  NOZZLES_WRITE: 'nozzles.write',

  // Phase 2A Hardened: Shift Templates
  SHIFT_TEMPLATES_READ: 'shift_templates.read',
  SHIFT_TEMPLATES_WRITE: 'shift_templates.write',

  // Phase 2A Hardened: Operational Shifts
  SHIFTS_READ: 'shifts.read',
  SHIFTS_OPEN: 'shifts.open',
  SHIFTS_CLOSE: 'shifts.close',

  // Phase 2A Hardened: Meter Readings
  METER_READINGS_READ: 'meter_readings.read',
  METER_READINGS_WRITE: 'meter_readings.write',

  // Phase 2B: Tank Stock, Calibration, Fuel Receipt & Reconciliation
  TANK_CALIBRATION_READ: 'tank_calibration.read',
  TANK_CALIBRATION_WRITE: 'tank_calibration.write',
  TANK_STOCK_READ: 'tank_stock.read',
  TANK_STOCK_WRITE: 'tank_stock.write',
  FUEL_RECEIPTS_READ: 'fuel_receipts.read',
  FUEL_RECEIPTS_WRITE: 'fuel_receipts.write',
  QUALITY_READ: 'quality.read',
  QUALITY_WRITE: 'quality.write',
  QUALITY_TOLERANCE_MANAGE: 'quality_tolerance.manage',
  STOCK_RECONCILIATION_READ: 'stock_reconciliation.read',
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const COOKIE_NAME = 'iocl_session';
export const SESSION_DURATION_HOURS = 24;
