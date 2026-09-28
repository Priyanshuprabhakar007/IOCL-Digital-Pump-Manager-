import { describe, it, expect, beforeEach } from 'vitest';
import { UserScopeAssignmentSchema } from '../src/shared/validators';
import { ScopeService } from '../src/worker/services/scopeService';
import { UserContext, RetailOutlet } from '../src/shared/types';

describe('Phase 1A Backend Security Hardening Tests', () => {

  describe('1. Automatic Database Seeding Checks', () => {
    it('app module should not export or execute seed automatically', async () => {
      const appModule = await import('../src/worker/app');
      expect(appModule.default).toBeDefined();
      expect((appModule as any).seedDatabase).toBeUndefined();
    });
  });

  describe('2. Independent Scope Resolution & Union Access', () => {
    const mockPunjabOutlet: RetailOutlet = {
      id: 'ro-pb-1',
      roCode: 'RO-PB-001',
      name: 'Ludhiana GT Road Outlet',
      outletType: 'A_SITE',
      stateId: 'state-pb',
      divisionId: 'div-ldh',
      salesAreaId: 'sa-ldh-cen',
      address: 'GT Road',
      city: 'Ludhiana',
      district: 'Ludhiana',
      pincode: '141003',
      latitude: 30.9,
      longitude: 75.8,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockDelhiOutlet: RetailOutlet = {
      id: 'ro-delhi-123',
      roCode: 'RO-DL-123',
      name: 'Connaught Place Service Station',
      outletType: 'COCO',
      stateId: 'state-delhi',
      divisionId: 'div-delhi',
      salesAreaId: 'sa-delhi-cen',
      address: 'CP Block A',
      city: 'New Delhi',
      district: 'Central Delhi',
      pincode: '110001',
      latitude: 28.6,
      longitude: 77.2,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockDelhiOutlet2: RetailOutlet = {
      id: 'ro-delhi-456',
      roCode: 'RO-DL-456',
      name: 'South Ex Retail Outlet',
      outletType: 'CODO',
      stateId: 'state-delhi',
      divisionId: 'div-delhi-south',
      salesAreaId: 'sa-delhi-south',
      address: 'South Ex Part 1',
      city: 'New Delhi',
      district: 'South Delhi',
      pincode: '110049',
      latitude: 28.5,
      longitude: 77.2,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const userWithPunjabStateAndDelhiOutlet: UserContext = {
      user: {
        id: 'user-multi-scope',
        empCode: 'EMP-999',
        name: 'Multi Scope Officer',
        email: 'officer@iocl.in',
        phone: '9999999999',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      roles: ['FIELD_OFFICER'],
      permissions: ['outlets.read'],
      scopes: [
        { id: 's1', userId: 'user-multi-scope', scopeLevel: 'STATE', stateId: 'state-pb', divisionId: null, salesAreaId: null, outletId: null, createdAt: '', createdBy: 'SYSTEM' },
        { id: 's2', userId: 'user-multi-scope', scopeLevel: 'OUTLET', stateId: null, divisionId: null, salesAreaId: null, outletId: 'ro-delhi-123', createdAt: '', createdBy: 'SYSTEM' },
      ],
      primaryScope: 'STATE',
      isGlobalScope: false,
      accessibleStateIds: ['state-pb'],
      accessibleDivisionIds: [],
      accessibleSalesAreaIds: [],
      accessibleOutletIds: ['ro-delhi-123'],
      isGlobalAdmin: false,
    };

    it('canAccessState should grant access to Punjab but reject Delhi', async () => {
      const canPb = await ScopeService.canAccessState(userWithPunjabStateAndDelhiOutlet, 'state-pb');
      const canDelhi = await ScopeService.canAccessState(userWithPunjabStateAndDelhiOutlet, 'state-delhi');

      expect(canPb).toBe(true);
      expect(canDelhi).toBe(false);
    });

    it('canAccessOutlet should grant access to specific Delhi outlet and Punjab outlet, but reject unassigned Delhi outlet', async () => {
      const mockOutletRepo: any = {
        findById: async (id: string) => {
          if (id === 'ro-delhi-123') return mockDelhiOutlet;
          if (id === 'ro-delhi-456') return mockDelhiOutlet2;
          if (id === 'ro-pb-1') return mockPunjabOutlet;
          return null;
        },
      };

      const canDelhi123 = await ScopeService.canAccessOutlet(userWithPunjabStateAndDelhiOutlet, 'ro-delhi-123', mockOutletRepo);
      const canDelhi456 = await ScopeService.canAccessOutlet(userWithPunjabStateAndDelhiOutlet, 'ro-delhi-456', mockOutletRepo);
      const canPb = await ScopeService.canAccessOutlet(userWithPunjabStateAndDelhiOutlet, 'ro-pb-1', mockOutletRepo);

      expect(canDelhi123).toBe(true);
      expect(canDelhi456).toBe(false);
      expect(canPb).toBe(true);
    });

    it('getAccessibleOutlets union logic should return exact union without expanding Delhi access', async () => {
      const mockOutletRepo: any = {
        findOutletsByIds: async (ids: string[]) => [mockDelhiOutlet],
        findOutletsBySalesAreaIds: async () => [],
        findOutletsByDivisionIds: async () => [],
        findOutletsByStateIds: async (ids: string[]) => [mockPunjabOutlet],
      };

      const result = await ScopeService.getAccessibleOutlets(userWithPunjabStateAndDelhiOutlet, mockOutletRepo);
      expect(result.length).toBe(2);
      expect(result.map(o => o.id)).toContain('ro-pb-1');
      expect(result.map(o => o.id)).toContain('ro-delhi-123');
      expect(result.map(o => o.id)).not.toContain('ro-delhi-456');
    });
  });

  describe('3. Global Access Requires Explicit GLOBAL Scope', () => {
    it('an ADMIN role without GLOBAL scope assignment should have isGlobalScope=false and limited access', async () => {
      const adminWithoutGlobalScope: UserContext = {
        user: {
          id: 'admin-local',
          empCode: 'ADM-LOC',
          name: 'Local Admin',
          email: 'localadmin@iocl.in',
          phone: '9888888888',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        roles: ['ADMIN'],
        permissions: ['users.create', 'outlets.read'],
        scopes: [
          { id: 's-loc', userId: 'admin-local', scopeLevel: 'STATE', stateId: 'state-wb', divisionId: null, salesAreaId: null, outletId: null, createdAt: '', createdBy: 'SYSTEM' },
        ],
        primaryScope: 'STATE',
        isGlobalScope: false,
        accessibleStateIds: ['state-wb'],
        accessibleDivisionIds: [],
        accessibleSalesAreaIds: [],
        accessibleOutletIds: [],
        isGlobalAdmin: false,
      };

      expect(adminWithoutGlobalScope.isGlobalScope).toBe(false);
      expect(adminWithoutGlobalScope.isGlobalAdmin).toBe(false);

      const canPb = await ScopeService.canAccessState(adminWithoutGlobalScope, 'state-pb');
      expect(canPb).toBe(false);
    });
  });

  describe('4. Strict Scope Payloads Validation', () => {
    it('accepts valid GLOBAL scope payload', () => {
      const res = UserScopeAssignmentSchema.safeParse({
        userId: 'usr-1',
        scopeLevel: 'GLOBAL',
      });
      expect(res.success).toBe(true);
    });

    it('accepts valid STATE scope payload', () => {
      const res = UserScopeAssignmentSchema.safeParse({
        userId: 'usr-1',
        scopeLevel: 'STATE',
        stateId: 'state-wb',
      });
      expect(res.success).toBe(true);
    });

    it('rejects STATE scope payload with extra narrower target IDs', () => {
      const res = UserScopeAssignmentSchema.safeParse({
        userId: 'usr-1',
        scopeLevel: 'STATE',
        stateId: 'state-wb',
        divisionId: 'div-kol',
      });
      expect(res.success).toBe(false);
    });

    it('rejects OUTLET scope payload without outletId', () => {
      const res = UserScopeAssignmentSchema.safeParse({
        userId: 'usr-1',
        scopeLevel: 'OUTLET',
      });
      expect(res.success).toBe(false);
    });
  });

});
