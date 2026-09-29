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
export type ShiftStatus = 'OPEN' | 'CLOSING' | 'CLOSED' | 'LOCKED';

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

// ==========================================
// Phase 2B: Tank Stock, Calibration, Receipts & Reconciliation Types
// ==========================================

export interface TankCalibrationPoint {
  id: string;
  tankId: string;
  dipMillimetresMilliunits: number;
  volumeMilliunits: number;
  dipMmStr?: string;
  volumeLitreStr?: string;
  createdAt: string;
  createdBy: string;
}

export interface OperationalShiftTankSnapshot {
  id: string;
  operationalShiftId: string;
  outletId: string;
  tankId: string;
  tankNumber: number;
  tankName: string;
  productId: string;
  productCode: string;
  productName: string;
  productUnit: ProductUnit;
  capacityMilliunits: number;
  safeFillCapacityMilliunits: number;
  capacityLitresStr?: string;
  safeFillLitresStr?: string;
  createdAt: string;
}

export type TankReadingType = 'OPENING' | 'CLOSING' | 'PRE_RECEIPT' | 'POST_RECEIPT' | 'ADHOC';
export type TankReadingSource = 'MANUAL' | 'ATG';

export interface TankStockReading {
  id: string;
  operationalShiftId: string;
  outletId: string;
  tankId: string;
  productId: string;
  readingType: TankReadingType;
  source: TankReadingSource;
  productDipMmMilliunits: number;
  waterDipMmMilliunits: number;
  grossObservedVolumeMilliunits: number;
  waterVolumeMilliunits: number;
  netProductVolumeMilliunits: number;
  productDipMmStr?: string;
  waterDipMmStr?: string;
  grossObservedVolumeStr?: string;
  waterVolumeStr?: string;
  netProductVolumeStr?: string;
  recordedAt: string;
  recordedByUserId: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  tankNumber?: number;
  tankName?: string;
  productCode?: string;
  productName?: string;
  recorderName?: string;
}

export type FuelReceiptStatus = 'ARRIVED' | 'VERIFIED' | 'DECANTED' | 'COMPLETED' | 'CANCELLED';
export type QualityStatus = 'PASS' | 'OUT_OF_TOLERANCE' | 'NOT_EVALUATED';

// ==========================================
// Phase 2C: Financial Reconciliation Types
// ==========================================

export interface ProductPrice {
  id: string;
  outletId: string;
  productId: string;
  pricePaisePerUnit: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  createdBy: string;
}

export interface OperationalShiftProductPrice {
  id: string;
  operationalShiftId: string;
  outletId: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  pricePaisePerUnit: number;
  pricePerUnitStr?: string;
  sourcePriceId: string;
  createdAt: string;
}

export interface CreditParty {
  id: string;
  outletId: string;
  partyCode: string;
  partyName: string;
  contactName?: string | null;
  phone?: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type CollectionType = "CASH" | "POS_CARD" | "UPI" | "FLEET_CARD" | "CREDIT_SALE" | "DIRECT_BANK_DROP";

export interface ShiftCollection {
  id: string;
  operationalShiftId: string;
  outletId: string;
  collectionType: CollectionType;
  amountPaise: number;
  amountStr?: string;
  provider?: string | null;
  referenceNumber?: string | null;
  creditPartyId?: string | null;
  creditPartyCodeSnapshot?: string | null;
  creditPartyNameSnapshot?: string | null;
  collectedAt: string;
  recordedByUserId: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CashHandover {
  id: string;
  operationalShiftId: string;
  outletId: string;
  amountPaise: number;
  amountStr?: string;
  handedOverByUserId: string;
  receivedByUserId?: string | null;
  handedOverAt: string;
  receivedAt?: string | null;
  status: "PENDING" | "ACKNOWLEDGED" | "DISPUTED";
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankDeposit {
  id: string;
  outletId: string;
  operationalShiftId: string;
  depositChannel: "BANK_BRANCH" | "CASH_DROP_BOX";
  amountPaise: number;
  amountStr?: string;
  depositDate: string;
  referenceNumber?: string | null;
  documentId?: string | null;
  status: "SUBMITTED" | "VERIFIED" | "REJECTED";
  recordedByUserId: string;
  verifiedByUserId?: string | null;
  verifiedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FinancialVarianceStatus = 'BALANCED' | 'SHORTAGE' | 'EXCESS';

export interface ShiftFinancialReconciliation {
  id: string;
  operationalShiftId: string;
  outletId: string;
  fuelSalesRevenuePaise: number;
  cngSalesRevenuePaise?: number | null;
  lubeSalesRevenuePaise?: number | null;
  authoritativeSalesRevenuePaise: number;
  cashCollectionPaise: number;
  posCollectionPaise: number;
  upiCollectionPaise: number;
  fleetCardCollectionPaise: number;
  creditSalesPaise: number;
  directBankDropPaise: number;
  totalCollectionsPaise: number;
  salesCollectionVariancePaise: number;
  varianceStatus: FinancialVarianceStatus;
  varianceReason?: string | null;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialRevenueProduct {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantityMilliunits: number;
  quantityStr: string;
  pricePaisePerUnit: number;
  pricePerUnitStr: string;
  revenuePaise: number;
  revenueStr: string;
}

export interface CashDepositControl {
  cashCollectedPaise: number;
  cashCollectedStr: string;
  verifiedCashDepositedPaise: number;
  verifiedCashDepositedStr: string;
  pendingCashDepositPaise: number;
  pendingCashDepositStr: string;
}

export interface CreditSalesPartySummary {
  creditPartyId: string;
  partyCode: string;
  partyName: string;
  amountPaise: number;
  amountStr: string;
}

export interface ShiftFinancialSummary {
  operationalShiftId: string;
  outletId: string;
  salesRevenue: {
    byProduct: FinancialRevenueProduct[];
    fuelTotalPaise: number;
    fuelTotalStr: string;
    cngTotalPaise: number | null;
    cngTotalStr: string | null;
    lubeTotalPaise: number | null;
    lubeTotalStr: string | null;
    includedComponents: string[];
    pendingComponents: string[];
    authoritativeTotalPaise: number;
    authoritativeTotalStr: string;
  };
  collections: {
    cashPaise: number;
    cashStr: string;
    posCardPaise: number;
    posCardStr: string;
    upiPaise: number;
    upiStr: string;
    fleetCardPaise: number;
    fleetCardStr: string;
    creditSalesPaise: number;
    creditSalesStr: string;
    directBankDropPaise: number;
    directBankDropStr: string;
    totalPaise: number;
    totalStr: string;
  };
  creditSalesByParty: CreditSalesPartySummary[];
  variancePaise: number;
  varianceStr: string;
  varianceStatus: FinancialVarianceStatus | null;
  varianceReason: string | null;
  cashHandoverSummary: {
    totalPendingPaise: number;
    totalPendingStr: string;
    totalAcknowledgedPaise: number;
    totalAcknowledgedStr: string;
  };
  bankDepositSummary: {
    totalSubmittedPaise: number;
    totalSubmittedStr: string;
    totalVerifiedPaise: number;
    totalVerifiedStr: string;
    totalRejectedPaise: number;
    totalRejectedStr: string;
  };
  cashDepositControl: CashDepositControl;
}

export interface FuelReceipt {
  id: string;
  outletId: string;
  operationalShiftId: string;
  ttNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  arrivalAt: string;
  decantationStartedAt?: string | null;
  decantationCompletedAt?: string | null;
  sealVerified: boolean;
  sealExceptionReason?: string | null;
  status: FuelReceiptStatus;
  recordedByUserId: string;
  createdAt: string;
  updatedAt: string;
  lines?: FuelReceiptTankLine[];
  recorderName?: string;
}

export interface FuelReceiptTankLine {
  id: string;
  fuelReceiptId: string;
  tankId: string;
  productId: string;
  invoiceQuantityMilliunits: number;
  invoiceQuantityStr?: string;
  preDecantReadingId?: string | null;
  postDecantReadingId?: string | null;
  measuredReceivedQuantityMilliunits?: number | null;
  measuredReceivedQuantityStr?: string | null;
  receiptVarianceMilliunits?: number | null;
  receiptVarianceStr?: string | null;
  densityMilliunits?: number | null;
  densityStr?: string | null;
  temperatureMilliunits?: number | null;
  temperatureStr?: string | null;
  invoiceDensityMilliunits?: number | null;
  invoiceDensityStr?: string | null;
  densityVarianceMilliunits?: number | null;
  densityVarianceStr?: string | null;
  qualityStatus: QualityStatus;
  appliedToleranceSettingId?: string | null;
  appliedDensityToleranceMilliunits?: number | null;
  appliedDensityToleranceStr?: string | null;
  createdAt: string;
  updatedAt: string;
  tankNumber?: number;
  tankName?: string;
  productCode?: string;
  productName?: string;
  preDecantReading?: TankStockReading | null;
  postDecantReading?: TankStockReading | null;
}

export type QualityScopeType = 'GLOBAL' | 'STATE' | 'DIVISION' | 'OUTLET';

export interface QualityToleranceSetting {
  id: string;
  scopeType: QualityScopeType;
  scopeEntityId?: string | null;
  productId?: string | null;
  densityToleranceMilliunits: number;
  densityToleranceStr?: string;
  status: 'ACTIVE' | 'INACTIVE';
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt: string;
  createdBy: string;
  productCode?: string;
  productName?: string;
}

export type VarianceStatus = 'GAIN' | 'LOSS' | 'BALANCED';

export interface ShiftStockReconciliation {
  id: string;
  operationalShiftId: string;
  outletId: string;
  tankId: string;
  productId: string;
  openingStockMilliunits: number;
  receiptQuantityMilliunits: number;
  salesQuantityMilliunits: number;
  theoreticalClosingStockMilliunits: number;
  physicalClosingStockMilliunits: number;
  varianceMilliunits: number;
  varianceStatus: VarianceStatus;
  openingStockStr: string;
  receiptQuantityStr: string;
  salesQuantityStr: string;
  theoreticalClosingStockStr: string;
  physicalClosingStockStr: string;
  varianceStr: string;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
  tankNumber?: number;
  tankName?: string;
  productCode?: string;
  productName?: string;
  productUnit?: ProductUnit;
}

export interface ShiftStockSummary {
  operationalShiftId: string;
  businessDate: string;
  outletId: string;
  byTank: Array<{
    tankId: string;
    tankNumber: number;
    tankName: string;
    productId: string;
    productCode: string;
    productName: string;
    productUnit: ProductUnit;
    openingStockStr: string | null;
    receiptQuantityStr: string;
    salesQuantityStr: string;
    theoreticalClosingStockStr: string | null;
    physicalClosingStockStr: string | null;
    varianceStr: string | null;
    varianceStatus: VarianceStatus | null;
    hasOpeningReading: boolean;
    hasClosingReading: boolean;
    receiptsCount: number;
  }>;
  byProduct: Array<{
    productId: string;
    productCode: string;
    productName: string;
    productUnit: ProductUnit;
    openingStockStr: string | null;
    receiptQuantityStr: string;
    salesQuantityStr: string;
    theoreticalClosingStockStr: string | null;
    physicalClosingStockStr: string | null;
    varianceStr: string | null;
    varianceStatus: VarianceStatus | null;
  }>;
}

// ==========================================
// Phase 3A-1: CNG Operations Types
// ==========================================

export interface CngShiftLog {
  id: string;
  operationalShiftId: string;
  outletId: string;
  mfmOpeningKgMilliunits: number;
  mfmClosingKgMilliunits: number;
  netSalesKgMilliunits: number;
  gridIntakeKgMilliunits: number | null;
  gridSalesVarianceKgMilliunits: number | null;
  mfmOpeningKg: string;
  mfmClosingKg: string;
  netSalesKg: string;
  gridIntakeKg: string | null;
  gridSalesVarianceKg: string | null;
  recordedByUserId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CngPressureReading {
  id: string;
  operationalShiftId: string;
  outletId: string;
  recordedAt: string;
  pressureUnit: string;
  suctionPressureMilliunits: number | null;
  dischargePressureMilliunits: number | null;
  cascadePressureMilliunits: number | null;
  suctionPressure: string | null;
  dischargePressure: string | null;
  cascadePressure: string | null;
  recordedByUserId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CngDailySummary {
  outletId: string;
  businessDate: string;
  totalMfmSalesKgMilliunits: number;
  totalMfmSalesKg: string;
  gridIntakeKgMilliunits: number | null;
  gridIntakeKg: string | null;
  gridSalesVarianceKgMilliunits: number | null;
  gridSalesVarianceKg: string | null;
  shiftCount: number;
  gridDataComplete: boolean;
}
