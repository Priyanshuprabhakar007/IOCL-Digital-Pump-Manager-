import { RoleCode, ScopeLevel, PermissionCode } from './constants';

export * from './constants';

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

export interface UserWithDetails extends User {
  roles: RoleSummary[];
  scopes: UserScopeAssignment[];
}

export interface RoleSummary {
  id: string;
  code: RoleCode;
  name: string;
  description: string;
}

export interface PermissionSummary {
  id: string;
  code: PermissionCode;
  name: string;
  description: string;
}

export interface UserScopeAssignment {
  id: string;
  userId: string;
  scopeLevel: ScopeLevel;
  stateId: string | null;
  divisionId: string | null;
  salesAreaId: string | null;
  outletId: string | null;
  assignedByUserId?: string;
  createdBy?: string;
  createdAt: string;
  userName?: string;
  stateName?: string;
  divisionName?: string;
  salesAreaName?: string;
  outletName?: string;
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
  stateId?: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  divisionName?: string;
  stateName?: string;
}

export interface RetailOutlet {
  id: string;
  roCode: string;
  name: string;
  outletType: 'COCO' | 'CODO' | 'A_SITE';
  category?: 'A_SITE' | 'B_SITE' | 'COCO' | 'CORO';
  stateId: string;
  divisionId: string;
  salesAreaId: string;
  address: string;
  location?: string;
  city: string;
  district: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
  salesAreaName?: string;
  divisionName?: string;
  stateName?: string;
  assignedUsersCount?: number;
}

export interface OutletUserAssignment {
  id: string;
  outletId: string;
  userId: string;
  assignmentType?: 'DEALER' | 'CSP' | 'INSPECTOR';
  effectiveFrom?: string;
  effectiveTo?: string | null;
  isActive?: boolean;
  isPrimary?: boolean;
  createdAt: string;
  createdBy?: string;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  revokedAt?: string | null;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  userName?: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValueJson: string | null;
  newValueJson: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface DocumentRecord {
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

export type Document = DocumentRecord;

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

export interface OperationalShiftNozzleSnapshot {
  id: string;
  operationalShiftId: string;
  outletId: string;
  nozzleId: string;
  dispenserId: string;
  dispenserNumber: number;
  dispenserName: string;
  nozzleNumber: number;
  productId: string;
  productCode: string;
  productName: string;
  productCategory: string;
  productUnit: ProductUnit;
  tankId: string;
  tankNumber: number;
  snapshotStatus: string;
  createdAt: string;
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
  openingTotalizerMilliunits?: number;
  closingTotalizerMilliunits?: number;
  testingQuantityMilliunits?: number;
  grossSalesQuantityMilliunits?: number;
  netSalesQuantityMilliunits?: number;
  openingVarianceMilliunits?: number;
  openingTotalizerStr: string;
  closingTotalizerStr: string;
  testingQuantityStr: string;
  grossSalesQuantityStr: string;
  netSalesQuantityStr: string;
  recordedByUserId: string;
  hasOpeningVariance: boolean;
  openingVarianceQuantity: number;
  openingVarianceStr?: string;
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

export interface UnitQuantitySummary {
  unit: ProductUnit;
  grossQuantity: string;
  testingQuantity: string;
  netQuantity: string;
  grossMilliunits?: number;
  testingMilliunits?: number;
  netMilliunits?: number;
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
    dispenserName: string;
    productId: string;
    productCode: string;
    productName: string;
    productCategory: string;
    unit: ProductUnit;
    openingTotalizerStr: string | null;
    closingTotalizerStr: string | null;
    grossQuantity: string;
    testingQuantity: string;
    netQuantity: string;
    openingTotalizer?: number | null;
    closingTotalizer?: number | null;
    isUnavailable: boolean;
    unavailableReason: string | null;
    hasVariance: boolean;
    varianceQuantity: string;
  }>;
  byDispenser: Array<{
    dispenserId: string;
    dispenserNumber: number;
    name: string;
    totalsByUnit: UnitQuantitySummary[];
  }>;
  byProduct: Array<{
    productId: string;
    productCode: string;
    productName: string;
    productCategory: string;
    unit: ProductUnit;
    grossQuantity: string;
    testingQuantity: string;
    netQuantity: string;
  }>;
  totalsByUnit: UnitQuantitySummary[];
}

export interface ShiftEntryGridItem {
  snapshot: OperationalShiftNozzleSnapshot;
  reading?: NozzleMeterReading | null;
  unavailability?: NozzleUnavailabilityRecord | null;
  suggestedOpeningTotalizer: string;
  hasPreviousShift: boolean;
}
