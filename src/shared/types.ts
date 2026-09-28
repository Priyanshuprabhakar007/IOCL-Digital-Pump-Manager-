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

// ==========================================
// Phase 2A: Pump Operations & Shift Foundation
// ==========================================

export type ProductCategory = 'MS' | 'HSD' | 'XP95' | 'XTRAGREEN' | 'CNG' | 'OTHER' | string;
export type ProductUnit = 'LITRE' | 'KG';
export type ProductStatus = 'ACTIVE' | 'INACTIVE';
export type EquipmentStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
export type ShiftStatus = 'OPEN' | 'CLOSED' | 'LOCKED';

export interface Product {
  id: string;
  code: string;
  name: string;
  category: ProductCategory;
  unit: ProductUnit;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OutletProduct {
  id: string;
  outletId: string;
  productId: string;
  status: ProductStatus;
  createdAt: string;
  createdBy: string;
  product?: Product;
}

export interface Tank {
  id: string;
  outletId: string;
  tankNumber: number;
  name: string;
  productId: string;
  capacityLitres: number;
  safeFillCapacityLitres: number;
  minimumOperatingLevelLitres: number;
  status: EquipmentStatus;
  commissionedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  productName?: string;
  productCode?: string;
}

export interface Dispenser {
  id: string;
  outletId: string;
  dispenserNumber: number;
  name: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  status: EquipmentStatus;
  commissionedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  nozzlesCount?: number;
}

export interface Nozzle {
  id: string;
  outletId: string;
  dispenserId: string;
  nozzleNumber: number;
  productId: string;
  tankId: string;
  status: EquipmentStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  dispenserNumber?: number;
  dispenserName?: string;
  productName?: string;
  productCode?: string;
  tankNumber?: number;
  tankName?: string;
}

export interface ShiftTemplate {
  id: string;
  outletId: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  sequence: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface OperationalShift {
  id: string;
  outletId: string;
  shiftTemplateId: string;
  businessDate: string;
  startedAt: string;
  closedAt: string | null;
  status: ShiftStatus;
  openedByUserId: string;
  closedByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  shiftTemplateName?: string;
  shiftTemplateCode?: string;
  openedByName?: string;
  closedByName?: string;
  outletName?: string;
  roCode?: string;
}

export interface NozzleMeterReading {
  id: string;
  operationalShiftId: string;
  outletId: string;
  nozzleId: string;
  openingTotalizer: number;
  closingTotalizer: number;
  testingQuantity: number;
  grossSalesQuantity: number;
  netSalesQuantity: number;
  recordedByUserId: string;
  hasOpeningVariance: boolean;
  openingVarianceQuantity: number;
  varianceReason: string | null;
  createdAt: string;
  updatedAt: string;
  nozzleNumber?: number;
  dispenserNumber?: number;
  dispenserName?: string;
  productName?: string;
  productCode?: string;
  recorderName?: string;
}

export interface NozzleUnavailabilityRecord {
  id: string;
  operationalShiftId: string;
  nozzleId: string;
  reason: string;
  recordedBy: string;
  createdAt: string;
  nozzleNumber?: number;
  dispenserNumber?: number;
  productName?: string;
  recordedByName?: string;
}

export interface ShiftSalesSummary {
  operationalShiftId: string;
  businessDate: string;
  status: ShiftStatus;
  outletId: string;
  byNozzle: Array<{
    nozzleId: string;
    nozzleNumber: number;
    dispenserId: string;
    dispenserNumber: number;
    productId: string;
    productName: string;
    productCategory: string;
    unit: string;
    openingTotalizer: number | null;
    closingTotalizer: number | null;
    grossQuantity: number;
    testingQuantity: number;
    netQuantity: number;
    isUnavailable: boolean;
    unavailableReason: string | null;
    hasVariance: boolean;
    varianceQuantity: number;
  }>;
  byDispenser: Array<{
    dispenserId: string;
    dispenserNumber: number;
    name: string;
    grossQuantity: number;
    testingQuantity: number;
    netQuantity: number;
  }>;
  byProduct: Array<{
    productId: string;
    productName: string;
    category: string;
    unit: string;
    grossQuantity: number;
    testingQuantity: number;
    netQuantity: number;
  }>;
  totalOutletQuantity: {
    grossQuantity: number;
    testingQuantity: number;
    netQuantity: number;
  };
}

export interface ShiftEntryGridItem {
  nozzle: Nozzle;
  reading?: NozzleMeterReading | null;
  unavailability?: NozzleUnavailabilityRecord | null;
  suggestedOpeningTotalizer: number;
  hasPreviousShift: boolean;
}

