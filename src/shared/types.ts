import { RoleCode, ScopeLevel, PermissionCode } from './constants';

export type { RoleCode, ScopeLevel, PermissionCode };

export interface User {
  id: string;
  empCode: string;
  name: string;
  email: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  description: string;
}

export interface Permission {
  id: string;
  code: PermissionCode;
  name: string;
  description: string;
}

export interface State {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Division {
  id: string;
  stateId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  stateName?: string;
}

export interface SalesArea {
  id: string;
  divisionId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  divisionName?: string;
  stateId?: string;
  stateName?: string;
}

export interface RetailOutlet {
  id: string;
  roCode: string;
  name: string;
  outletType: 'COCO' | 'CODO' | 'A_SITE';
  stateId: string;
  divisionId: string;
  salesAreaId: string;
  address: string;
  city: string;
  district: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  stateName?: string;
  divisionName?: string;
  salesAreaName?: string;
  assignedUsersCount?: number;
}

export interface OutletUserAssignment {
  id: string;
  outletId: string;
  userId: string;
  assignmentType: 'DEALER' | 'CSP' | 'INSPECTOR';
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  userName?: string;
  userEmail?: string;
  userEmpCode?: string;
  outletName?: string;
  roCode?: string;
}

export interface UserScopeAssignment {
  id: string;
  userId: string;
  scopeLevel: ScopeLevel;
  stateId: string | null;
  divisionId: string | null;
  salesAreaId: string | null;
  outletId: string | null;
  createdAt: string;
  createdBy: string;
  userName?: string;
  stateName?: string;
  divisionName?: string;
  salesAreaName?: string;
  outletName?: string;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  revokedAt: string | null;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValueJson: string | null;
  newValueJson: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  userName?: string;
  userEmail?: string;
}

export interface Document {
  id: string;
  r2Key: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  outletId: string | null;
  uploadedByUserId: string;
  createdAt: string;
  uploadedByName?: string;
  outletName?: string;
}

export interface UserContext {
  user: User;
  roles: RoleCode[];
  permissions: PermissionCode[];
  scopes: UserScopeAssignment[];
  primaryScope: ScopeLevel;
  isGlobalScope: boolean;
  accessibleStateIds: string[];
  accessibleDivisionIds: string[];
  accessibleSalesAreaIds: string[];
  accessibleOutletIds: string[];
  isGlobalAdmin: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
}
