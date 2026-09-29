import { z } from 'zod';
import { parseMilliunits } from './precision';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password required'),
});

export const RoleCodeSchema = z.enum([
  'ADMIN',
  'STATE_OFFICE',
  'DIVISIONAL_OFFICE',
  'BUSINESS_MANAGER',
  'FIELD_OFFICER',
  'DEALER',
  'CSP',
]);

export const ScopeLevelSchema = z.enum([
  'GLOBAL',
  'STATE',
  'DIVISION',
  'SALES_AREA',
  'OUTLET',
]);

export const CreateUserSchema = z.object({
  empCode: z.string().min(3, 'Employee code must be at least 3 characters').trim().toUpperCase(),
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  phone: z.string().min(10, 'Phone must be at least 10 digits').regex(/^[0-9+\-\s]+$/, 'Invalid phone number format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  roleCodes: z.array(RoleCodeSchema).min(1, 'At least one valid role is required'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
  initialScope: z.object({
    scopeLevel: ScopeLevelSchema,
    stateId: z.string().nullable().optional(),
    divisionId: z.string().nullable().optional(),
    salesAreaId: z.string().nullable().optional(),
    outletId: z.string().nullable().optional(),
  }).optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).trim().optional(),
  phone: z.string().min(10).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

export const UserCreateSchema = CreateUserSchema;
export const UserUpdateSchema = UpdateUserSchema;
export const UserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
});

export const CreateStateSchema = z.object({
  code: z.string().min(2).max(10).trim().toUpperCase(),
  name: z.string().min(2).trim(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export const StateSchema = CreateStateSchema;

export const CreateDivisionSchema = z.object({
  stateId: z.string().min(1, 'State ID required'),
  code: z.string().min(2).max(10).trim().toUpperCase(),
  name: z.string().min(2).trim(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export const DivisionSchema = CreateDivisionSchema;

export const CreateSalesAreaSchema = z.object({
  divisionId: z.string().min(1, 'Division ID required'),
  code: z.string().min(2).max(10).trim().toUpperCase(),
  name: z.string().min(2).trim(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export const SalesAreaSchema = CreateSalesAreaSchema;

export const RetailOutletSchema = z.object({
  roCode: z.string().min(3).trim().toUpperCase(),
  name: z.string().min(2).trim(),
  outletType: z.enum(['A_SITE', 'COCO', 'CODO']).default('A_SITE'),
  category: z.enum(['A_SITE', 'B_SITE', 'COCO', 'CORO', 'CODO']).optional(),
  stateId: z.string().min(1, 'State ID required'),
  divisionId: z.string().min(1, 'Division ID required'),
  salesAreaId: z.string().min(1, 'Sales Area ID required'),
  address: z.string().min(1, 'Address required').trim().default('Main Road'),
  location: z.string().min(1, 'Location required').trim().optional(),
  city: z.string().min(1, 'City required').trim().default('City'),
  district: z.string().min(1, 'District required').trim().default('District'),
  pincode: z.string().trim().default('700001'),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export const CreateRetailOutletSchema = RetailOutletSchema;

export const UpdateRetailOutletSchema = z.object({
  name: z.string().min(2).trim().optional(),
  outletType: z.enum(['A_SITE', 'B_SITE', 'COCO', 'CORO', 'CODO']).optional(),
  category: z.enum(['A_SITE', 'B_SITE', 'COCO', 'CORO', 'CODO']).optional(),
  address: z.string().min(1).trim().optional(),
  location: z.string().min(1).trim().optional(),
  city: z.string().min(1).trim().optional(),
  district: z.string().min(1).trim().optional(),
  pincode: z.string().trim().optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const RetailOutletUpdateSchema = UpdateRetailOutletSchema;

export const OutletUserAssignmentSchema = z.object({
  outletId: z.string().min(1, 'Outlet ID required'),
  userId: z.string().min(1, 'User ID required'),
  assignmentType: z.enum(['DEALER', 'CSP', 'INSPECTOR']).default('DEALER'),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
});

export const AssignScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: ScopeLevelSchema,
  stateId: z.string().nullable().optional(),
  divisionId: z.string().nullable().optional(),
  salesAreaId: z.string().nullable().optional(),
  outletId: z.string().nullable().optional(),
});

export const GlobalScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.literal('GLOBAL'),
  stateId: z.null().optional(),
  divisionId: z.null().optional(),
  salesAreaId: z.null().optional(),
  outletId: z.null().optional(),
}).strict();

export const StateScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.literal('STATE'),
  stateId: z.string().min(1, 'stateId is required for STATE scope'),
  divisionId: z.null().optional(),
  salesAreaId: z.null().optional(),
  outletId: z.null().optional(),
}).strict();

export const DivisionScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.literal('DIVISION'),
  divisionId: z.string().min(1, 'divisionId is required for DIVISION scope'),
  stateId: z.null().optional(),
  salesAreaId: z.null().optional(),
  outletId: z.null().optional(),
}).strict();

export const SalesAreaScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.literal('SALES_AREA'),
  salesAreaId: z.string().min(1, 'salesAreaId is required for SALES_AREA scope'),
  stateId: z.null().optional(),
  divisionId: z.null().optional(),
  outletId: z.null().optional(),
}).strict();

export const OutletScopeSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.literal('OUTLET'),
  outletId: z.string().min(1, 'outletId is required for OUTLET scope'),
  stateId: z.null().optional(),
  divisionId: z.null().optional(),
  salesAreaId: z.null().optional(),
}).strict();

export const UserScopeAssignmentSchema = z.discriminatedUnion('scopeLevel', [
  GlobalScopeSchema,
  StateScopeSchema,
  DivisionScopeSchema,
  SalesAreaScopeSchema,
  OutletScopeSchema,
]);

export const DocumentMetadataSchema = z.object({
  name: z.string().min(1, 'Document name required'),
  mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg'], {
    error: 'Only PDF, PNG, and JPEG documents are permitted',
  }),
  sizeBytes: z.number().positive().max(5242880, 'File size cannot exceed 5 MB'),
  outletId: z.string().min(1, 'Outlet ID is required for document upload'),
});

// ==========================================
// Phase 2A Hardened: Pump Operations & Shift
// ==========================================

export const ProductSchema = z.object({
  code: z.string().min(1, 'Product code is required').trim().toUpperCase(),
  name: z.string().min(2, 'Product name is required').trim(),
  category: z.string().min(1, 'Product category is required').trim(),
  unit: z.enum(['LITRE', 'KG']),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const ProductUpdateSchema = z.object({
  name: z.string().min(2, 'Product name is required').trim().optional(),
  category: z.string().min(1, 'Product category is required').trim().optional(),
  unit: z.enum(['LITRE', 'KG']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const OutletProductSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const TankSchema = z.object({
  tankNumber: z.number().int().positive('Tank number must be a positive integer'),
  name: z.string().min(1, 'Tank name is required').trim(),
  productId: z.string().min(1, 'Product ID is required'),
  capacityLitres: z.number().positive('Capacity must be greater than 0'),
  safeFillCapacityLitres: z.number().positive('Safe fill capacity must be greater than 0'),
  minimumOperatingLevelLitres: z.number().min(0, 'Minimum operating level must be non-negative'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).default('ACTIVE'),
  commissionedAt: z.string().nullable().optional(),
}).refine(data => data.safeFillCapacityLitres <= data.capacityLitres, {
  message: 'Safe fill capacity cannot exceed total capacity',
  path: ['safeFillCapacityLitres'],
});

export const TankUpdateSchema = z.object({
  name: z.string().min(1).trim().optional(),
  productId: z.string().min(1).optional(),
  capacityLitres: z.number().positive().optional(),
  safeFillCapacityLitres: z.number().positive().optional(),
  minimumOperatingLevelLitres: z.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).optional(),
  commissionedAt: z.string().nullable().optional(),
});

export const DispenserSchema = z.object({
  dispenserNumber: z.number().int().positive('Dispenser number must be a positive integer'),
  name: z.string().min(1, 'Dispenser name is required').trim(),
  manufacturer: z.string().trim().nullable().optional(),
  model: z.string().trim().nullable().optional(),
  serialNumber: z.string().trim().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).default('ACTIVE'),
  commissionedAt: z.string().nullable().optional(),
});

export const DispenserUpdateSchema = z.object({
  name: z.string().min(1).trim().optional(),
  manufacturer: z.string().trim().nullable().optional(),
  model: z.string().trim().nullable().optional(),
  serialNumber: z.string().trim().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).optional(),
  commissionedAt: z.string().nullable().optional(),
});

export const NozzleSchema = z.object({
  dispenserId: z.string().min(1, 'Dispenser ID is required'),
  nozzleNumber: z.number().int().positive('Nozzle number must be a positive integer'),
  productId: z.string().min(1, 'Product ID is required'),
  tankId: z.string().min(1, 'Tank ID is required'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).default('ACTIVE'),
});

export const NozzleUpdateSchema = z.object({
  productId: z.string().min(1).optional(),
  tankId: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).optional(),
});

export const ShiftTemplateSchema = z.object({
  code: z.string().min(1, 'Shift code is required').trim().toUpperCase(),
  name: z.string().min(2, 'Shift name is required').trim(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be in HH:MM format (24h)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be in HH:MM format (24h)'),
  sequence: z.number().int().min(1).default(1),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const OpenShiftSchema = z.object({
  shiftTemplateId: z.string().min(1, 'Shift template is required'),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be YYYY-MM-DD'),
  notes: z.string().trim().nullable().optional(),
});

const StrictDecimalQuantityString = z.string()
  .trim()
  .refine(val => {
    if (!/^\d+(\.\d{1,3})?$/.test(val)) {
      return false;
    }
    try {
      parseMilliunits(val);
      return true;
    } catch {
      return false;
    }
  }, { message: 'Quantity must be a valid non-negative decimal string with at most 3 decimal places (e.g. "1000.125")' });

export const MeterReadingSchema = z.object({
  nozzleId: z.string().min(1, 'Nozzle ID is required'),
  openingTotalizer: StrictDecimalQuantityString,
  closingTotalizer: StrictDecimalQuantityString,
  testingQuantity: StrictDecimalQuantityString.default('0.000'),
  varianceReason: z.string().trim().nullable().optional(),
}).refine(data => {
  try {
    const op = parseMilliunits(data.openingTotalizer);
    const cl = parseMilliunits(data.closingTotalizer);
    return cl >= op;
  } catch {
    return true;
  }
}, {
  message: 'Closing totalizer must be greater than or equal to opening totalizer',
  path: ['closingTotalizer'],
}).refine(data => {
  try {
    const op = parseMilliunits(data.openingTotalizer);
    const cl = parseMilliunits(data.closingTotalizer);
    const test = parseMilliunits(data.testingQuantity);
    const gross = cl - op;
    return test <= gross;
  } catch {
    return true;
  }
}, {
  message: 'Testing quantity cannot exceed gross sales quantity',
  path: ['testingQuantity'],
});

export const NozzleUnavailabilitySchema = z.object({
  nozzleId: z.string().min(1, 'Nozzle ID is required'),
  reason: z.string().min(3, 'A valid reason (minimum 3 characters) is required').trim(),
});

// ==========================================
// Phase 2B: Tank Stock, Calibration, Receipts & Reconciliation Validators
// ==========================================

export const TankCalibrationPointSchema = z.object({
  dipMillimetres: StrictDecimalQuantityString,
  volumeLitres: StrictDecimalQuantityString,
});

export const TankCalibrationBulkSchema = z.object({
  points: z.array(TankCalibrationPointSchema).min(2, 'At least 2 calibration points are required to define a calibration chart'),
});

export const TankStockReadingSchema = z.object({
  tankId: z.string().min(1, 'Tank ID is required'),
  readingType: z.enum(['OPENING', 'CLOSING', 'PRE_RECEIPT', 'POST_RECEIPT', 'ADHOC']),
  source: z.enum(['MANUAL', 'ATG']).default('MANUAL'),
  productDipMm: StrictDecimalQuantityString,
  waterDipMm: StrictDecimalQuantityString.default('0.000'),
  notes: z.string().trim().nullable().optional(),
}).refine(data => {
  try {
    const prodDip = parseMilliunits(data.productDipMm);
    const waterDip = parseMilliunits(data.waterDipMm);
    return waterDip <= prodDip;
  } catch {
    return true;
  }
}, {
  message: 'Water dip cannot exceed product dip',
  path: ['waterDipMm'],
});

export const FuelReceiptLineSchema = z.object({
  tankId: z.string().min(1, 'Tank ID is required'),
  productId: z.string().min(1, 'Product ID is required'),
  invoiceQuantity: StrictDecimalQuantityString,
  density: StrictDecimalQuantityString.optional().nullable(),
  temperature: StrictDecimalQuantityString.optional().nullable(),
  invoiceDensity: StrictDecimalQuantityString.optional().nullable(),
});

export const FuelReceiptCreateSchema = z.object({
  ttNumber: z.string().min(1, 'Tank Truck / TT Number is required').trim(),
  invoiceNumber: z.string().min(1, 'Invoice Number is required').trim(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invoice date must be YYYY-MM-DD'),
  arrivalAt: z.string().min(1, 'Arrival timestamp is required'),
  sealVerified: z.boolean().default(true),
  sealExceptionReason: z.string().trim().nullable().optional(),
  lines: z.array(FuelReceiptLineSchema).min(1, 'At least one receiving tank line is required'),
}).refine(data => {
  if (data.sealVerified === false && (!data.sealExceptionReason || data.sealExceptionReason.trim().length === 0)) {
    return false;
  }
  return true;
}, {
  message: 'A seal exception reason is required when seal is not verified',
  path: ['sealExceptionReason'],
});

export const FuelReceiptLineUpdateSchema = z.object({
  preDecantReadingId: z.string().optional().nullable(),
  postDecantReadingId: z.string().optional().nullable(),
  density: StrictDecimalQuantityString.optional().nullable(),
  temperature: StrictDecimalQuantityString.optional().nullable(),
  invoiceDensity: StrictDecimalQuantityString.optional().nullable(),
});

export const FuelReceiptStatusUpdateSchema = z.object({
  status: z.enum(['ARRIVED', 'VERIFIED', 'DECANTED', 'COMPLETED', 'CANCELLED']),
  decantationStartedAt: z.string().optional().nullable(),
  decantationCompletedAt: z.string().optional().nullable(),
  sealVerified: z.boolean().optional(),
  sealExceptionReason: z.string().optional().nullable(),
});

import { parseMoneyToPaise } from './financialUtils';

export const MoneyStringSchema = z.string().refine((val) => {
  try {
    parseMoneyToPaise(val);
    return true;
  } catch {
    return false;
  }
}, { message: "Invalid positive decimal money format (at most 2 decimal places)" });

export const PositiveMoneyStringSchema = z.string().refine((val) => {
  try {
    const paise = parseMoneyToPaise(val);
    return paise > 0;
  } catch {
    return false;
  }
}, { message: "Invalid positive money format or amount must be greater than 0 (at most 2 decimal places)" });

export const ProductPriceSchema = z.object({
  productId: z.string().min(1, "Product ID required"),
  pricePaisePerUnit: PositiveMoneyStringSchema,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
}).refine(data => {
  if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
    return false;
  }
  return true;
}, {
  message: 'effectiveTo cannot be earlier than effectiveFrom',
  path: ['effectiveTo'],
});

export const CreditPartySchema = z.object({
  partyCode: z.string().trim().min(1, "Party code required"),
  partyName: z.string().trim().min(1, "Party name required"),
  contactName: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const ShiftCollectionSchema = z.object({
  collectionType: z.enum(["CASH", "POS_CARD", "UPI", "FLEET_CARD", "CREDIT_SALE", "DIRECT_BANK_DROP"]),
  amount: PositiveMoneyStringSchema,
  provider: z.string().trim().optional().nullable(),
  referenceNumber: z.string().trim().optional().nullable(),
  creditPartyId: z.string().trim().optional().nullable(),
  collectedAt: z.string().min(1, "Collection time required"),
  notes: z.string().trim().optional().nullable(),
}).refine(data => {
  if (data.collectionType === 'CREDIT_SALE' && !data.creditPartyId) return false;
  return true;
}, {
  message: 'Credit party is required for credit sales',
  path: ['creditPartyId']
});

export const CashHandoverSchema = z.object({
  amount: PositiveMoneyStringSchema,
  handedOverAt: z.string().min(1, "Handover time required"),
  notes: z.string().trim().optional().nullable(),
});

export const BankDepositSchema = z.object({
  depositChannel: z.enum(["BANK_BRANCH", "CASH_DROP_BOX"]),
  amount: PositiveMoneyStringSchema,
  depositDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  referenceNumber: z.string().trim().optional().nullable(),
  documentId: z.string().trim().optional().nullable(),
});

export const FinancialVarianceReasonSchema = z.object({
  varianceReason: z.string().trim().min(3, "Reason must be at least 3 characters"),
});

export const QualityToleranceSchema = z.object({
  scopeType: z.enum(['GLOBAL', 'STATE', 'DIVISION', 'OUTLET']),
  scopeEntityId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  densityTolerance: StrictDecimalQuantityString,
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective from date must be YYYY-MM-DD'),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective to date must be YYYY-MM-DD').optional().nullable(),
});
