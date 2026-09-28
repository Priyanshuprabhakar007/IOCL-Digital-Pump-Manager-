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
  await db.insert(schema.roles).values(rolesList);

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
  ];
  await db.insert(schema.permissions).values(permissionsList);

  // 3. Role Permissions Mapping
  const allPermIds = permissionsList.map(p => p.id);
  const adminRolePerms = allPermIds.map(pId => ({ roleId: 'role-admin', permissionId: pId }));

  const stateOfficePerms = [
    'perm-u-r', 'perm-u-c', 'perm-u-u',
    'perm-h-r', 'perm-o-r', 'perm-s-r', 'perm-s-a',
    'perm-d-r', 'perm-a-r'
  ].map(pId => ({ roleId: 'role-so', permissionId: pId }));

  const divOfficePerms = [
    'perm-u-r', 'perm-u-c', 'perm-u-u',
    'perm-h-r', 'perm-o-r', 'perm-o-u',
    'perm-s-r', 'perm-d-r', 'perm-d-w', 'perm-a-r'
  ].map(pId => ({ roleId: 'role-do', permissionId: pId }));

  const bmPerms = [
    'perm-u-r', 'perm-h-r', 'perm-o-r', 'perm-s-r', 'perm-d-r', 'perm-a-r'
  ].map(pId => ({ roleId: 'role-bm', permissionId: pId }));

  const fieldOfficerPerms = [
    'perm-h-r', 'perm-o-r', 'perm-o-u', 'perm-d-r', 'perm-d-w'
  ].map(pId => ({ roleId: 'role-fo', permissionId: pId }));

  const dealerPerms = [
    'perm-o-r', 'perm-d-r', 'perm-d-w'
  ].map(pId => ({ roleId: 'role-dealer', permissionId: pId }));

  const cspPerms = [
    'perm-o-r', 'perm-d-r'
  ].map(pId => ({ roleId: 'role-csp', permissionId: pId }));

  await db.insert(schema.rolePermissions).values([
    ...adminRolePerms,
    ...stateOfficePerms,
    ...divOfficePerms,
    ...bmPerms,
    ...fieldOfficerPerms,
    ...dealerPerms,
    ...cspPerms,
  ]);

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

  // 10. Audit Log Initial Entry
  await db.insert(schema.auditLogs).values({
    id: 'audit-init-001',
    userId: 'user-admin',
    action: 'SYSTEM_SEED',
    entityType: 'SYSTEM',
    entityId: 'SYSTEM',
    oldValueJson: null,
    newValueJson: JSON.stringify({ message: 'IOCL Digital Pump Manager database seeded successfully' }),
    ipAddress: '127.0.0.1',
    userAgent: 'D1 Seeder Engine',
    createdAt: now,
  });
}
