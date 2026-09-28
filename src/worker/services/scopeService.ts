import { UserContext, RetailOutlet, ScopeLevel, User, Document, UserScopeAssignment } from '../../shared/types';
import { OutletRepository } from '../repositories/outletRepository';
import { UserRepository } from '../repositories/userRepository';
import { ScopeRepository } from '../repositories/scopeRepository';
import { HierarchyRepository } from '../repositories/hierarchyRepository';

export class ScopeService {
  /**
   * Helper: Get accessible State IDs.
   */
  static getAccessibleStateIds(userCtx: UserContext): string[] {
    return userCtx.accessibleStateIds;
  }

  /**
   * Helper: Get accessible Division IDs.
   */
  static getAccessibleDivisionIds(userCtx: UserContext): string[] {
    return userCtx.accessibleDivisionIds;
  }

  /**
   * Helper: Get accessible Sales Area IDs.
   */
  static getAccessibleSalesAreaIds(userCtx: UserContext): string[] {
    return userCtx.accessibleSalesAreaIds;
  }

  /**
   * Helper: Get accessible Outlet IDs.
   */
  static getAccessibleOutletIds(userCtx: UserContext): string[] {
    return userCtx.accessibleOutletIds;
  }

  /**
   * Helper: Check if user has explicit access to a specific State.
   */
  static async canAccessState(
    userCtx: UserContext,
    stateId: string
  ): Promise<boolean> {
    if (userCtx.isGlobalScope) return true;
    return userCtx.accessibleStateIds.includes(stateId);
  }

  /**
   * Helper: Check if user has access to a specific Division.
   */
  static async canAccessDivision(
    userCtx: UserContext,
    divisionId: string,
    hierarchyRepo: HierarchyRepository
  ): Promise<boolean> {
    if (userCtx.isGlobalScope) return true;
    if (userCtx.accessibleDivisionIds.includes(divisionId)) return true;

    const div = await hierarchyRepo.findDivisionById(divisionId);
    if (!div) return false;

    return userCtx.accessibleStateIds.includes(div.stateId);
  }

  /**
   * Helper: Check if user has access to a specific Sales Area.
   */
  static async canAccessSalesArea(
    userCtx: UserContext,
    salesAreaId: string,
    hierarchyRepo: HierarchyRepository
  ): Promise<boolean> {
    if (userCtx.isGlobalScope) return true;
    if (userCtx.accessibleSalesAreaIds.includes(salesAreaId)) return true;

    const sa = await hierarchyRepo.findSalesAreaById(salesAreaId);
    if (!sa) return false;

    if (userCtx.accessibleDivisionIds.includes(sa.divisionId)) return true;
    if (sa.stateId && userCtx.accessibleStateIds.includes(sa.stateId)) return true;

    return false;
  }

  /**
   * Helper: Check if user has access to a specific Outlet.
   */
  static async canAccessOutlet(
    userCtx: UserContext,
    outletId: string,
    outletRepo: OutletRepository
  ): Promise<boolean> {
    if (userCtx.isGlobalScope) return true;
    if (userCtx.accessibleOutletIds.includes(outletId)) return true;

    const outlet = await outletRepo.findById(outletId);
    if (!outlet) return false;

    if (userCtx.accessibleSalesAreaIds.includes(outlet.salesAreaId)) return true;
    if (userCtx.accessibleDivisionIds.includes(outlet.divisionId)) return true;
    if (userCtx.accessibleStateIds.includes(outlet.stateId)) return true;

    return false;
  }

  /**
   * Centralized resolution of outlets accessible by a given user context.
   * Evaluates every scope assignment independently and unions the exact accessible entities.
   */
  static async getAccessibleOutlets(
    userCtx: UserContext,
    outletRepo: OutletRepository
  ): Promise<RetailOutlet[]> {
    if (userCtx.isGlobalScope) {
      return await outletRepo.listAllOutlets();
    }

    const outletMap = new Map<string, RetailOutlet>();

    // 1. Direct OUTLET scopes
    if (userCtx.accessibleOutletIds.length > 0) {
      const outlets = await outletRepo.findOutletsByIds(userCtx.accessibleOutletIds);
      outlets.forEach(o => outletMap.set(o.id, o));
    }

    // 2. SALES_AREA scopes
    if (userCtx.accessibleSalesAreaIds.length > 0) {
      const outlets = await outletRepo.findOutletsBySalesAreaIds(userCtx.accessibleSalesAreaIds);
      outlets.forEach(o => outletMap.set(o.id, o));
    }

    // 3. DIVISION scopes
    if (userCtx.accessibleDivisionIds.length > 0) {
      const outlets = await outletRepo.findOutletsByDivisionIds(userCtx.accessibleDivisionIds);
      outlets.forEach(o => outletMap.set(o.id, o));
    }

    // 4. STATE scopes
    if (userCtx.accessibleStateIds.length > 0) {
      const outlets = await outletRepo.findOutletsByStateIds(userCtx.accessibleStateIds);
      outlets.forEach(o => outletMap.set(o.id, o));
    }

    return Array.from(outletMap.values());
  }

  /**
   * Centralized resolution of users accessible under current scope boundaries.
   */
  static async getAccessibleUsers(
    userCtx: UserContext,
    userRepo: UserRepository,
    scopeRepo: ScopeRepository
  ): Promise<User[]> {
    const allUsers = await userRepo.listAllUsers();
    if (userCtx.isGlobalScope) {
      return allUsers;
    }

    const allScopes = await scopeRepo.listAllScopes();
    const accessibleUserIds = new Set<string>();
    accessibleUserIds.add(userCtx.user.id); // Always include self

    for (const scope of allScopes) {
      if (scope.stateId && userCtx.accessibleStateIds.includes(scope.stateId)) {
        accessibleUserIds.add(scope.userId);
      } else if (scope.divisionId && userCtx.accessibleDivisionIds.includes(scope.divisionId)) {
        accessibleUserIds.add(scope.userId);
      } else if (scope.salesAreaId && userCtx.accessibleSalesAreaIds.includes(scope.salesAreaId)) {
        accessibleUserIds.add(scope.userId);
      } else if (scope.outletId && userCtx.accessibleOutletIds.includes(scope.outletId)) {
        accessibleUserIds.add(scope.userId);
      }
    }

    return allUsers.filter(u => accessibleUserIds.has(u.id));
  }

  /**
   * Check if actor has authority to manage target user and assign/modify their roles.
   */
  static async canManageUser(
    actorCtx: UserContext,
    targetUserId: string,
    userRepo: UserRepository,
    scopeRepo: ScopeRepository
  ): Promise<boolean> {
    if (actorCtx.user.id === targetUserId) {
      return true; // Self inspection allowed, but role/scope escalation checked separately
    }

    if (actorCtx.isGlobalScope) {
      return true;
    }

    const targetUserScopes = await scopeRepo.getUserScopes(targetUserId);
    if (targetUserScopes.some(s => s.scopeLevel === 'GLOBAL')) {
      return false; // Non-global user cannot manage a GLOBAL user
    }

    // Target user must fall inside actor's scope
    const accessibleUsers = await ScopeService.getAccessibleUsers(actorCtx, userRepo, scopeRepo);
    return accessibleUsers.some(u => u.id === targetUserId);
  }

  /**
   * Get numeric role ceiling level for role hierarchy checks.
   */
  static getRoleLevel(roleCode: string): number {
    switch (roleCode) {
      case 'ADMIN': return 5;
      case 'STATE_OFFICE': return 4;
      case 'DIVISIONAL_OFFICE': return 3;
      case 'BUSINESS_MANAGER': return 2;
      case 'FIELD_OFFICER': return 2;
      case 'DEALER': return 1;
      case 'CSP': return 1;
      default: return 0;
    }
  }

  /**
   * Validate if actor can grant specified roles under role ceiling rules.
   */
  static validateRoleCeiling(actorCtx: UserContext, targetRoles: string[]): { allowed: boolean; message?: string } {
    if (actorCtx.isGlobalScope) {
      return { allowed: true };
    }

    // Find actor's highest role level
    const actorRoleLevels = actorCtx.roles.map(r => ScopeService.getRoleLevel(r));
    const actorMaxLevel = Math.max(...actorRoleLevels, 0);

    for (const requestedRole of targetRoles) {
      const requestedLevel = ScopeService.getRoleLevel(requestedRole);

      if (requestedRole === 'ADMIN' && !actorCtx.isGlobalScope) {
        return { allowed: false, message: 'Only GLOBAL Admins can grant the ADMIN role' };
      }

      if (requestedRole === 'STATE_OFFICE' && actorMaxLevel < 4) {
        return { allowed: false, message: 'You do not have administrative level to grant STATE_OFFICE role' };
      }

      if (requestedLevel > actorMaxLevel) {
        return { allowed: false, message: `Cannot grant role ${requestedRole} which is higher than your role level` };
      }
    }

    return { allowed: true };
  }

  /**
   * Server-side validation and parent ancestry derivation for new scope assignments.
   */
  static async validateAndDeriveScope(
    payload: {
      scopeLevel: ScopeLevel;
      stateId?: string | null;
      divisionId?: string | null;
      salesAreaId?: string | null;
      outletId?: string | null;
    },
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<{
    valid: boolean;
    message?: string;
    derived: {
      stateId: string | null;
      divisionId: string | null;
      salesAreaId: string | null;
      outletId: string | null;
    };
  }> {
    const { scopeLevel } = payload;

    if (scopeLevel === 'GLOBAL') {
      return {
        valid: true,
        derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: null },
      };
    }

    if (scopeLevel === 'STATE') {
      if (!payload.stateId) return { valid: false, message: 'stateId is required for STATE scope', derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: null } };
      const st = await hierarchyRepo.findStateById(payload.stateId);
      if (!st) return { valid: false, message: 'Invalid State ID', derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: null } };

      return {
        valid: true,
        derived: { stateId: st.id, divisionId: null, salesAreaId: null, outletId: null },
      };
    }

    if (scopeLevel === 'DIVISION') {
      if (!payload.divisionId) return { valid: false, message: 'divisionId is required for DIVISION scope', derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: null } };
      const div = await hierarchyRepo.findDivisionById(payload.divisionId);
      if (!div) return { valid: false, message: 'Invalid Division ID', derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: null } };

      return {
        valid: true,
        derived: { stateId: null, divisionId: div.id, salesAreaId: null, outletId: null },
      };
    }

    if (scopeLevel === 'SALES_AREA') {
      if (!payload.salesAreaId) return { valid: false, message: 'salesAreaId is required for SALES_AREA scope', derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: null } };
      const sa = await hierarchyRepo.findSalesAreaById(payload.salesAreaId);
      if (!sa) return { valid: false, message: 'Invalid Sales Area ID', derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: null } };

      return {
        valid: true,
        derived: { stateId: null, divisionId: null, salesAreaId: sa.id, outletId: null },
      };
    }

    if (scopeLevel === 'OUTLET') {
      if (!payload.outletId) return { valid: false, message: 'outletId is required for OUTLET scope', derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: null } };
      const outlet = await outletRepo.findById(payload.outletId);
      if (!outlet) return { valid: false, message: 'Invalid Outlet ID', derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: null } };

      return {
        valid: true,
        derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: outlet.id },
      };
    }

    return { valid: false, message: 'Invalid scope level', derived: { stateId: null, divisionId: null, salesAreaId: null, outletId: null } };
  }
}
