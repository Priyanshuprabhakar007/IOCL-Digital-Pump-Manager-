import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const ValidRoleCodes = [
  'ADMIN',
  'STATE_OFFICE',
  'DIVISIONAL_OFFICE',
  'BUSINESS_MANAGER',
  'FIELD_OFFICER',
  'DEALER',
  'CSP',
] as const;

export const RoleCodeSchema = z.enum(ValidRoleCodes);

export const InitialScopePayloadSchema = z.discriminatedUnion('scopeLevel', [
  z.object({
    scopeLevel: z.literal('GLOBAL'),
  }).strict(),
  z.object({
    scopeLevel: z.literal('STATE'),
    stateId: z.string().min(1, 'stateId is required for STATE scope'),
  }).strict(),
  z.object({
    scopeLevel: z.literal('DIVISION'),
    divisionId: z.string().min(1, 'divisionId is required for DIVISION scope'),
  }).strict(),
  z.object({
    scopeLevel: z.literal('SALES_AREA'),
    salesAreaId: z.string().min(1, 'salesAreaId is required for SALES_AREA scope'),
  }).strict(),
  z.object({
    scopeLevel: z.literal('OUTLET'),
    outletId: z.string().min(1, 'outletId is required for OUTLET scope'),
  }).strict(),
]);

export type InitialScopePayload = z.infer<typeof InitialScopePayloadSchema>;

export const UserCreateSchema = z.object({
  empCode: z.string().min(3, 'Employee code must be at least 3 characters'),
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  roleCodes: z.array(RoleCodeSchema).min(1, 'At least one role is required'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
  initialScope: InitialScopePayloadSchema.optional(),
});

export const UserUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).optional(),
  roleCodes: z.array(RoleCodeSchema).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

export const UserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
});

export const StateSchema = z.object({
  code: z.string().min(2, 'State code required').max(10),
  name: z.string().min(2, 'State name required'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const DivisionSchema = z.object({
  stateId: z.string().min(1, 'State ID required'),
  code: z.string().min(2, 'Division code required').max(10),
  name: z.string().min(2, 'Division name required'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const SalesAreaSchema = z.object({
  divisionId: z.string().min(1, 'Division ID required'),
  code: z.string().min(2, 'Sales area code required').max(10),
  name: z.string().min(2, 'Sales area name required'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const RetailOutletSchema = z.object({
  roCode: z.string().min(3, 'RO Code must be at least 3 characters'),
  name: z.string().min(2, 'Outlet name required'),
  outletType: z.enum(['COCO', 'CODO', 'A_SITE']),
  stateId: z.string().min(1, 'State is required'),
  divisionId: z.string().min(1, 'Division is required'),
  salesAreaId: z.string().min(1, 'Sales Area is required'),
  address: z.string().min(5, 'Address required'),
  city: z.string().min(2, 'City required'),
  district: z.string().min(2, 'District required'),
  pincode: z.string().length(6, 'Pincode must be 6 digits'),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const OutletUserAssignmentSchema = z.object({
  outletId: z.string().min(1, 'Outlet ID required'),
  userId: z.string().min(1, 'User ID required'),
  assignmentType: z.enum(['DEALER', 'CSP', 'INSPECTOR']),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().nullable().optional(),
});

// Strict Discriminated Union for User Scope Assignment
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
// Phase 2A: Pump Operations & Shift Foundation
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

export const MeterReadingSchema = z.object({
  nozzleId: z.string().min(1, 'Nozzle ID is required'),
  openingTotalizer: z.number().min(0, 'Opening totalizer must be non-negative'),
  closingTotalizer: z.number().min(0, 'Closing totalizer must be non-negative'),
  testingQuantity: z.number().min(0, 'Testing quantity must be non-negative').default(0),
  varianceReason: z.string().trim().nullable().optional(),
}).refine(data => data.closingTotalizer >= data.openingTotalizer, {
  message: 'Closing totalizer must be greater than or equal to opening totalizer',
  path: ['closingTotalizer'],
});

export const NozzleUnavailabilitySchema = z.object({
  nozzleId: z.string().min(1, 'Nozzle ID is required'),
  reason: z.string().min(3, 'A valid reason (minimum 3 characters) is required').trim(),
});

