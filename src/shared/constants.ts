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

  // Phase 2A: Pump Operations & Shift Foundation
  PRODUCTS_READ: 'products.read',
  PRODUCTS_WRITE: 'products.write',

  TANKS_READ: 'tanks.read',
  TANKS_WRITE: 'tanks.write',

  DISPENSERS_READ: 'dispensers.read',
  DISPENSERS_WRITE: 'dispensers.write',

  NOZZLES_READ: 'nozzles.read',
  NOZZLES_WRITE: 'nozzles.write',

  SHIFTS_READ: 'shifts.read',
  SHIFTS_MANAGE: 'shifts.manage',

  READINGS_READ: 'readings.read',
  READINGS_WRITE: 'readings.write',
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const COOKIE_NAME = 'iocl_session';
export const SESSION_DURATION_HOURS = 24;
