import { AppDatabase } from './index';
import * as schema from './schema';
import bcrypt from 'bcryptjs';
import { ROLES, PERMISSIONS } from '../shared/constants';

export async function seedDatabase(db: AppDatabase) {
  const existingUsers = await db.select().from(schema.users);
  if (existingUsers.length > 0) {
    return; // Already seeded
  }

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync('Password@123', 10);

  // 1. Roles
  const rolesList = [
    { id: 'role-admin', code: ROLES.ADMIN, name: 'System Administrator', description: 'Full access across all organizational units and capabilities' },
    { id: 'role-so', code: ROLES.STATE_OFFICE, name: 'State Office Executive', description: 'State-level oversight, user scope management, and monitoring' },
    { id: 'role-do', code: ROLES.DIVISIONAL_OFFICE, name: 'Divisional Office Manager', description: 'Divisional operations management and outlet supervision' },
    { id: 'role-bm', code: ROLES.BUSINESS_MANAGER, name: 'Business Manager', description: 'Regional business analytics and field officer supervision' },
    { id: 'role-fo', code: ROLES.FIELD_OFFICER, name: 'Field Officer', description: 'Field level inspection and retail outlet compliance manager' },
    { id: 'role-dealer', code: ROLES.DEALER, name: 'Retail Outlet Dealer', description: 'Outlet franchisee / owner with access to assigned outlet operations' },
    { id: 'role-csp', code: ROLES.CSP, name: 'Customer Service Provider', description: 'Outlet staff / attendant with operational data access' },
  ];
  await db.insert(schema.roles).values(rolesList).onConflictDoNothing();

  // 2. Permissions
  const permissionsList = [
    { id: 'perm-u-r', code: PERMISSIONS.USERS_READ, name: 'Read Users', description: 'View user profiles within scope' },
    { id: 'perm-u-c', code: PERMISSIONS.USERS_CREATE, name: 'Create Users', description: 'Provision new system users' },
    { id: 'perm-u-u', code: PERMISSIONS.USERS_UPDATE, name: 'Update Users', description: 'Modify user details and status' },

    { id: 'perm-h-r', code: PERMISSIONS.HIERARCHY_READ, name: 'Read Hierarchy', description: 'View state, division, sales area structures' },
    { id: 'perm-h-w', code: PERMISSIONS.HIERARCHY_WRITE, name: 'Write Hierarchy', description: 'Manage state, division, sales area structures' },

    { id: 'perm-o-r', code: PERMISSIONS.OUTLETS_READ, name: 'Read Outlets', description: 'View retail outlet records and master data' },
    { id: 'perm-o-c', code: PERMISSIONS.OUTLETS_CREATE, name: 'Create Outlets', description: 'Register new retail outlets' },
    { id: 'perm-o-u', code: PERMISSIONS.OUTLETS_UPDATE, name: 'Update Outlets', description: 'Modify outlet master details' },

    { id: 'perm-s-r', code: PERMISSIONS.SCOPES_READ, name: 'Read Scopes', description: 'View user scope assignments' },
    { id: 'perm-s-a', code: PERMISSIONS.SCOPES_ASSIGN, name: 'Assign Scopes', description: 'Modify user organizational scopes' },

    { id: 'perm-d-r', code: PERMISSIONS.DOCUMENTS_READ, name: 'Read Documents', description: 'View outlet documents' },
    { id: 'perm-d-w', code: PERMISSIONS.DOCUMENTS_WRITE, name: 'Write Documents', description: 'Upload and manage documents' },

    { id: 'perm-a-r', code: PERMISSIONS.AUDIT_READ, name: 'Read Audit Logs', description: 'View system audit trail' },

    // Phase 2A Hardened: Granular Products
    { id: 'perm-prod-r', code: PERMISSIONS.PRODUCTS_READ, name: 'Read Products', description: 'View master fuel products catalog' },
    { id: 'perm-prod-mg', code: PERMISSIONS.PRODUCTS_MANAGE_GLOBAL, name: 'Manage Global Products', description: 'Manage global products catalog' },
    { id: 'perm-oprod-r', code: PERMISSIONS.OUTLET_PRODUCTS_READ, name: 'Read Outlet Products', description: 'View outlet product assignments' },
    { id: 'perm-oprod-w', code: PERMISSIONS.OUTLET_PRODUCTS_WRITE, name: 'Write Outlet Products', description: 'Assign products to outlet' },

    // Phase 2A Hardened: Tanks
    { id: 'perm-tank-r', code: PERMISSIONS.TANKS_READ, name: 'Read Tanks', description: 'View underground storage tank master' },
    { id: 'perm-tank-w', code: PERMISSIONS.TANKS_WRITE, name: 'Write Tanks', description: 'Manage underground storage tanks' },

    // Phase 2A Hardened: Dispensers
    { id: 'perm-disp-r', code: PERMISSIONS.DISPENSERS_READ, name: 'Read Dispensers', description: 'View dispenser units master' },
    { id: 'perm-disp-w', code: PERMISSIONS.DISPENSERS_WRITE, name: 'Write Dispensers', description: 'Manage dispenser units' },

    // Phase 2A Hardened: Nozzles
    { id: 'perm-nozz-r', code: PERMISSIONS.NOZZLES_READ, name: 'Read Nozzles', description: 'View dispensing nozzles master' },
    { id: 'perm-nozz-w', code: PERMISSIONS.NOZZLES_WRITE, name: 'Write Nozzles', description: 'Manage dispensing nozzles' },

    // Phase 2A Hardened: Shift Templates
    { id: 'perm-stm-r', code: PERMISSIONS.SHIFT_TEMPLATES_READ, name: 'Read Shift Templates', description: 'View shift templates' },
    { id: 'perm-stm-w', code: PERMISSIONS.SHIFT_TEMPLATES_WRITE, name: 'Write Shift Templates', description: 'Configure shift templates' },

    // Phase 2A Hardened: Operational Shifts
    { id: 'perm-shf-r', code: PERMISSIONS.SHIFTS_READ, name: 'Read Shifts', description: 'View operational shifts' },
    { id: 'perm-shf-o', code: PERMISSIONS.SHIFTS_OPEN, name: 'Open Shifts', description: 'Open operational shifts' },
    { id: 'perm-shf-c', code: PERMISSIONS.SHIFTS_CLOSE, name: 'Close Shifts', description: 'Close operational shifts' },

    // Phase 2A Hardened: Meter Readings
    { id: 'perm-rdg-r', code: PERMISSIONS.METER_READINGS_READ, name: 'Read Meter Readings', description: 'View nozzle meter readings' },
    { id: 'perm-rdg-w', code: PERMISSIONS.METER_READINGS_WRITE, name: 'Write Meter Readings', description: 'Record meter readings and unavailability' },
  ];
  await db.insert(schema.permissions).values(permissionsList).onConflictDoNothing();

  // 3. Role Permissions Mapping
  const allPermIds = permissionsList.map(p => p.id);
  const adminRolePerms = allPermIds.map(pId => ({ roleId: 'role-admin', permissionId: pId }));

  const stateOfficePerms = [
    'perm-u-r', 'perm-u-c', 'perm-u-u',
    'perm-h-r', 'perm-o-r', 'perm-s-r', 'perm-s-a',
    'perm-d-r', 'perm-a-r',
    'perm-prod-r', 'perm-oprod-r', 'perm-tank-r', 'perm-disp-r', 'perm-nozz-r', 'perm-stm-r', 'perm-shf-r', 'perm-rdg-r',
  ].map(pId => ({ roleId: 'role-so', permissionId: pId }));

  const divOfficePerms = [
    'perm-u-r', 'perm-u-c', 'perm-u-u',
    'perm-h-r', 'perm-o-r', 'perm-o-u',
    'perm-s-r', 'perm-d-r', 'perm-d-w', 'perm-a-r',
    'perm-prod-r', 'perm-oprod-r', 'perm-tank-r', 'perm-disp-r', 'perm-nozz-r', 'perm-stm-r', 'perm-shf-r', 'perm-rdg-r',
  ].map(pId => ({ roleId: 'role-do', permissionId: pId }));

  const bmPerms = [
    'perm-u-r', 'perm-h-r', 'perm-o-r', 'perm-s-r', 'perm-d-r', 'perm-a-r',
    'perm-prod-r', 'perm-oprod-r', 'perm-tank-r', 'perm-disp-r', 'perm-nozz-r', 'perm-stm-r', 'perm-shf-r', 'perm-rdg-r',
  ].map(pId => ({ roleId: 'role-bm', permissionId: pId }));

  const fieldOfficerPerms = [
    'perm-h-r', 'perm-o-r', 'perm-o-u', 'perm-d-r', 'perm-d-w',
    'perm-prod-r', 'perm-oprod-r', 'perm-tank-r', 'perm-disp-r', 'perm-nozz-r', 'perm-stm-r', 'perm-shf-r', 'perm-rdg-r',
  ].map(pId => ({ roleId: 'role-fo', permissionId: pId }));

  const dealerPerms = [
    'perm-o-r', 'perm-d-r', 'perm-d-w',
    'perm-prod-r', 'perm-oprod-r', 'perm-oprod-w',
    'perm-tank-r', 'perm-tank-w',
    'perm-disp-r', 'perm-disp-w',
    'perm-nozz-r', 'perm-nozz-w',
    'perm-stm-r', 'perm-stm-w',
    'perm-shf-r', 'perm-shf-o', 'perm-shf-c',
    'perm-rdg-r', 'perm-rdg-w',
  ].map(pId => ({ roleId: 'role-dealer', permissionId: pId }));

  const cspPerms = [
    'perm-o-r', 'perm-d-r',
    'perm-prod-r', 'perm-oprod-r',
    'perm-tank-r',
    'perm-disp-r',
    'perm-nozz-r',
    'perm-stm-r',
    'perm-shf-r', 'perm-shf-o', 'perm-shf-c',
    'perm-rdg-r', 'perm-rdg-w',
  ].map(pId => ({ roleId: 'role-csp', permissionId: pId }));

  await db.insert(schema.rolePermissions).values([
    ...adminRolePerms,
    ...stateOfficePerms,
    ...divOfficePerms,
    ...bmPerms,
    ...fieldOfficerPerms,
    ...dealerPerms,
    ...cspPerms,
  ]).onConflictDoNothing();

  // 4. Hierarchy (State -> Division -> Sales Area)
  const stateWb = { id: 'state-wb', code: 'WBSO', name: 'West Bengal State Office', status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  const statePb = { id: 'state-pb', code: 'PPSO', name: 'Punjab State Office', status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  await db.insert(schema.states).values([stateWb, statePb]);

  const divKolkata = { id: 'div-kol', stateId: 'state-wb', code: 'KOL-DO', name: 'Kolkata Divisional Office', status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  const divLudhiana = { id: 'div-ldh', stateId: 'state-pb', code: 'LDH-DO', name: 'Ludhiana Divisional Office', status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  await db.insert(schema.divisions).values([divKolkata, divLudhiana]);

  const saCentral = { id: 'sa-cen', divisionId: 'div-kol', code: 'KOL-CEN-SA', name: 'Kolkata Central Sales Area', status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  const saNorth = { id: 'sa-nor', divisionId: 'div-kol', code: 'KOL-NOR-SA', name: 'Kolkata North Sales Area', status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  const saLdhCentral = { id: 'sa-ldh-cen', divisionId: 'div-ldh', code: 'LDH-CEN-SA', name: 'Ludhiana Central Sales Area', status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  await db.insert(schema.salesAreas).values([saCentral, saNorth, saLdhCentral]);

  // 5. Retail Outlets
  const outlet1 = {
    id: 'ro-1001',
    roCode: 'RO-110023',
    name: 'Park Street IOCL Service Station',
    outletType: 'COCO' as const,
    stateId: 'state-wb',
    divisionId: 'div-kol',
    salesAreaId: 'sa-cen',
    address: '45 Park Street, Chowringhee',
    city: 'Kolkata',
    district: 'Kolkata',
    pincode: '700016',
    latitude: 22.5532,
    longitude: 88.3526,
    status: 'ACTIVE' as const,
    createdAt: now,
    updatedAt: now,
  };

  const outlet2 = {
    id: 'ro-1002',
    roCode: 'RO-110024',
    name: 'Salt Lake City Sector V Retail Outlet',
    outletType: 'CODO' as const,
    stateId: 'state-wb',
    divisionId: 'div-kol',
    salesAreaId: 'sa-nor',
    address: 'Block GP, Sector V, Salt Lake',
    city: 'Kolkata',
    district: 'North 24 Parganas',
    pincode: '700091',
    latitude: 22.5726,
    longitude: 88.4331,
    status: 'ACTIVE' as const,
    createdAt: now,
    updatedAt: now,
  };

  const outlet3 = {
    id: 'ro-1003',
    roCode: 'RO-110025',
    name: 'GT Road Ludhiana Fuel Outlet',
    outletType: 'A_SITE' as const,
    stateId: 'state-pb',
    divisionId: 'div-ldh',
    salesAreaId: 'sa-ldh-cen',
    address: '100 GT Road, Miller Ganj',
    city: 'Ludhiana',
    district: 'Ludhiana',
    pincode: '141003',
    latitude: 30.9010,
    longitude: 75.8573,
    status: 'ACTIVE' as const,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.retailOutlets).values([outlet1, outlet2, outlet3]);

  // 6. Demo Users
  const userAdmin = { id: 'user-admin', empCode: 'IOCL-ADM-001', name: 'Rajesh Sharma', email: 'admin@iocl.in', phone: '9830000001', passwordHash, status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  const userSO = { id: 'user-so', empCode: 'IOCL-SO-001', name: 'Ananya Roy', email: 'wbso@iocl.in', phone: '9830000002', passwordHash, status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  const userDO = { id: 'user-do', empCode: 'IOCL-DO-001', name: 'Vikram Banerjee', email: 'kolkatado@iocl.in', phone: '9830000003', passwordHash, status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  const userBM = { id: 'user-bm', empCode: 'IOCL-BM-001', name: 'Ramesh Krishnan', email: 'bm.kolkata@iocl.in', phone: '9830000007', passwordHash, status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  const userFO = { id: 'user-fo', empCode: 'IOCL-FO-001', name: 'Subhashish Das', email: 'fo.central@iocl.in', phone: '9830000004', passwordHash, status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  const userDealer = { id: 'user-dealer', empCode: 'IOCL-DLR-001', name: 'Pritam Mukherjee', email: 'dealer.parkstreet@iocl.in', phone: '9830000005', passwordHash, status: 'ACTIVE' as const, createdAt: now, updatedAt: now };
  const userCSP = { id: 'user-csp', empCode: 'IOCL-CSP-001', name: 'Rahul Sen', email: 'csp.parkstreet@iocl.in', phone: '9830000006', passwordHash, status: 'ACTIVE' as const, createdAt: now, updatedAt: now };

  await db.insert(schema.users).values([userAdmin, userSO, userDO, userBM, userFO, userDealer, userCSP]);

  // 7. Assign User Roles
  await db.insert(schema.userRoles).values([
    { userId: 'user-admin', roleId: 'role-admin' },
    { userId: 'user-so', roleId: 'role-so' },
    { userId: 'user-do', roleId: 'role-do' },
    { userId: 'user-bm', roleId: 'role-bm' },
    { userId: 'user-fo', roleId: 'role-fo' },
    { userId: 'user-dealer', roleId: 'role-dealer' },
    { userId: 'user-csp', roleId: 'role-csp' },
  ]);

  // 8. Assign User Scopes
  await db.insert(schema.userScopeAssignments).values([
    // Admin: Explicit GLOBAL scope
    { id: 'scope-admin', userId: 'user-admin', scopeLevel: 'GLOBAL', stateId: null, divisionId: null, salesAreaId: null, outletId: null, createdAt: now, createdBy: 'SYSTEM' },
    // State Office: STATE (WBSO)
    { id: 'scope-so', userId: 'user-so', scopeLevel: 'STATE', stateId: 'state-wb', divisionId: null, salesAreaId: null, outletId: null, createdAt: now, createdBy: 'SYSTEM' },
    // Divisional Office: DIVISION (Kolkata DO)
    { id: 'scope-do', userId: 'user-do', scopeLevel: 'DIVISION', stateId: null, divisionId: 'div-kol', salesAreaId: null, outletId: null, createdAt: now, createdBy: 'SYSTEM' },
    // Business Manager: DIVISION (Kolkata DO)
    { id: 'scope-bm', userId: 'user-bm', scopeLevel: 'DIVISION', stateId: null, divisionId: 'div-kol', salesAreaId: null, outletId: null, createdAt: now, createdBy: 'SYSTEM' },
    // Field Officer: SALES_AREA (Kolkata Central SA)
    { id: 'scope-fo', userId: 'user-fo', scopeLevel: 'SALES_AREA', stateId: null, divisionId: null, salesAreaId: 'sa-cen', outletId: null, createdAt: now, createdBy: 'SYSTEM' },
    // Dealer: OUTLET (Park Street Outlet RO-110023)
    { id: 'scope-dealer', userId: 'user-dealer', scopeLevel: 'OUTLET', stateId: null, divisionId: null, salesAreaId: null, outletId: 'ro-1001', createdAt: now, createdBy: 'SYSTEM' },
    // CSP: OUTLET (Park Street Outlet RO-110023)
    { id: 'scope-csp', userId: 'user-csp', scopeLevel: 'OUTLET', stateId: null, divisionId: null, salesAreaId: null, outletId: 'ro-1001', createdAt: now, createdBy: 'SYSTEM' },
  ]);

  // 9. Outlet User Assignments
  await db.insert(schema.outletUserAssignments).values([
    { id: 'oua-1', outletId: 'ro-1001', userId: 'user-dealer', assignmentType: 'DEALER', effectiveFrom: now, effectiveTo: null, isActive: true, createdAt: now, createdBy: 'SYSTEM' },
    { id: 'oua-2', outletId: 'ro-1001', userId: 'user-csp', assignmentType: 'CSP', effectiveFrom: now, effectiveTo: null, isActive: true, createdAt: now, createdBy: 'SYSTEM' },
  ]);

  // 10. Master Products Catalog
  const defaultProducts = [
    { id: 'prod-ms', code: 'MS', name: 'Motor Spirit (Petrol)', category: 'MS', unit: 'LITRE' as const, status: 'ACTIVE' as const, createdAt: now, updatedAt: now },
    { id: 'prod-hsd', code: 'HSD', name: 'High Speed Diesel', category: 'HSD', unit: 'LITRE' as const, status: 'ACTIVE' as const, createdAt: now, updatedAt: now },
    { id: 'prod-xp95', code: 'XP95', name: 'XP95 Premium Petrol', category: 'XP95', unit: 'LITRE' as const, status: 'ACTIVE' as const, createdAt: now, updatedAt: now },
    { id: 'prod-xtragreen', code: 'XTRAGREEN', name: 'XTRAGREEN Diesel', category: 'XTRAGREEN', unit: 'LITRE' as const, status: 'ACTIVE' as const, createdAt: now, updatedAt: now },
    { id: 'prod-cng', code: 'CNG', name: 'Compressed Natural Gas', category: 'CNG', unit: 'KG' as const, status: 'ACTIVE' as const, createdAt: now, updatedAt: now },
  ];
  await db.insert(schema.products).values(defaultProducts);

  // 11. Outlet Product Mapping (Park Street RO sells MS, HSD, XP95)
  await db.insert(schema.outletProducts).values([
    { id: 'op-ro1-ms', outletId: 'ro-1001', productId: 'prod-ms', status: 'ACTIVE' as const, createdAt: now, createdBy: 'user-admin' },
    { id: 'op-ro1-hsd', outletId: 'ro-1001', productId: 'prod-hsd', status: 'ACTIVE' as const, createdAt: now, createdBy: 'user-admin' },
    { id: 'op-ro1-xp95', outletId: 'ro-1001', productId: 'prod-xp95', status: 'ACTIVE' as const, createdAt: now, createdBy: 'user-admin' },
  ]);

  // 12. Underground Storage Tanks (Park Street RO)
  await db.insert(schema.tanks).values([
    {
      id: 'tank-ro1-1',
      outletId: 'ro-1001',
      tankNumber: 1,
      name: 'Tank 1 - MS (20 KL)',
      productId: 'prod-ms',
      capacityLitres: 20000,
      safeFillCapacityLitres: 19000,
      minimumOperatingLevelLitres: 1000,
      status: 'ACTIVE' as const,
      commissionedAt: '2023-01-15T00:00:00Z',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
    {
      id: 'tank-ro1-2',
      outletId: 'ro-1001',
      tankNumber: 2,
      name: 'Tank 2 - HSD (25 KL)',
      productId: 'prod-hsd',
      capacityLitres: 25000,
      safeFillCapacityLitres: 23750,
      minimumOperatingLevelLitres: 1500,
      status: 'ACTIVE' as const,
      commissionedAt: '2023-01-15T00:00:00Z',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
  ]);

  // 13. Dispensers (Park Street RO)
  await db.insert(schema.dispensers).values([
    {
      id: 'disp-ro1-1',
      outletId: 'ro-1001',
      dispenserNumber: 1,
      name: 'Multi-Product Dispenser 01 (MPD-1)',
      manufacturer: 'Wayne Dresser',
      model: 'Helix 5000',
      serialNumber: 'WD-2023-01991',
      status: 'ACTIVE' as const,
      commissionedAt: '2023-01-20T00:00:00Z',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
    {
      id: 'disp-ro1-2',
      outletId: 'ro-1001',
      dispenserNumber: 2,
      name: 'Multi-Product Dispenser 02 (MPD-2)',
      manufacturer: 'Gilbarco Veeder-Root',
      model: 'Horizon',
      serialNumber: 'GVR-2023-08812',
      status: 'ACTIVE' as const,
      commissionedAt: '2023-01-20T00:00:00Z',
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
  ]);

  // 14. Nozzles (Park Street RO)
  await db.insert(schema.nozzles).values([
    // Dispenser 1: Nozzle 1 (MS from Tank 1), Nozzle 2 (HSD from Tank 2)
    {
      id: 'nozz-ro1-1-1',
      outletId: 'ro-1001',
      dispenserId: 'disp-ro1-1',
      nozzleNumber: 1,
      productId: 'prod-ms',
      tankId: 'tank-ro1-1',
      status: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
    {
      id: 'nozz-ro1-1-2',
      outletId: 'ro-1001',
      dispenserId: 'disp-ro1-1',
      nozzleNumber: 2,
      productId: 'prod-hsd',
      tankId: 'tank-ro1-2',
      status: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
    // Dispenser 2: Nozzle 1 (MS from Tank 1), Nozzle 2 (HSD from Tank 2)
    {
      id: 'nozz-ro1-2-1',
      outletId: 'ro-1001',
      dispenserId: 'disp-ro1-2',
      nozzleNumber: 1,
      productId: 'prod-ms',
      tankId: 'tank-ro1-1',
      status: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
    {
      id: 'nozz-ro1-2-2',
      outletId: 'ro-1001',
      dispenserId: 'disp-ro1-2',
      nozzleNumber: 2,
      productId: 'prod-hsd',
      tankId: 'tank-ro1-2',
      status: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
  ]);

  // 15. Shift Templates (Park Street RO)
  await db.insert(schema.shiftTemplates).values([
    {
      id: 'st-ro1-1',
      outletId: 'ro-1001',
      code: 'SHIFT_1',
      name: 'Shift 1 (Morning)',
      startTime: '06:00',
      endTime: '14:00',
      sequence: 1,
      status: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
    {
      id: 'st-ro1-2',
      outletId: 'ro-1001',
      code: 'SHIFT_2',
      name: 'Shift 2 (Evening)',
      startTime: '14:00',
      endTime: '22:00',
      sequence: 2,
      status: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
    {
      id: 'st-ro1-3',
      outletId: 'ro-1001',
      code: 'SHIFT_3',
      name: 'Shift 3 (Night Overnight)',
      startTime: '22:00',
      endTime: '06:00',
      sequence: 3,
      status: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
    {
      id: 'st-ro1-gen',
      outletId: 'ro-1001',
      code: 'GENERAL',
      name: 'General Shift',
      startTime: '09:00',
      endTime: '18:00',
      sequence: 4,
      status: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user-admin',
    },
  ]);

  // 16. Audit Log Initial Entry
  await db.insert(schema.auditLogs).values({
    id: 'audit-init-001',
    userId: 'user-admin',
    action: 'SYSTEM_SEED',
    entityType: 'SYSTEM',
    entityId: 'SYSTEM',
    oldValueJson: null,
    newValueJson: JSON.stringify({ message: 'IOCL Digital Pump Manager database seeded successfully with Phase 1 & 2A infrastructure' }),
    ipAddress: '127.0.0.1',
    userAgent: 'D1 Seeder Engine',
    createdAt: now,
  });
}
