import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const UserCreateSchema = z.object({
  empCode: z.string().min(3, 'Employee code must be at least 3 characters'),
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  roleCodes: z.array(z.string()).min(1, 'At least one role is required'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
});

export const UserUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).optional(),
  roleCodes: z.array(z.string()).optional(),
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
  outletType: z.enum(['COCO', 'DOCO', 'DODO']),
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

export const UserScopeAssignmentSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  scopeLevel: z.enum(['GLOBAL', 'STATE', 'DIVISION', 'SALES_AREA', 'OUTLET']),
  stateId: z.string().nullable().optional(),
  divisionId: z.string().nullable().optional(),
  salesAreaId: z.string().nullable().optional(),
  outletId: z.string().nullable().optional(),
});

export const DocumentMetadataSchema = z.object({
  name: z.string().min(1, 'Document name required'),
  mimeType: z.string().min(1, 'Mime type required'),
  sizeBytes: z.number().positive(),
  outletId: z.string().nullable().optional(),
  r2Key: z.string().optional(),
});
