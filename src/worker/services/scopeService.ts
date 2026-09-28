import { UserContext, RetailOutlet, ScopeLevel, User, Document } from '../../shared/types';
import { OutletRepository } from '../repositories/outletRepository';
import { UserRepository } from '../repositories/userRepository';
import { ScopeRepository } from '../repositories/scopeRepository';
import { HierarchyRepository } from '../repositories/hierarchyRepository';

export class ScopeService {
  /**
   * Centralized resolution of outlets accessible by a given user context.
   * Enforces GLOBAL, STATE, DIVISION, SALES_AREA, and OUTLET boundaries.
   */
  static async getAccessibleOutlets(
    userCtx: UserContext,
    outletRepo: OutletRepository
  ): Promise<RetailOutlet[]> {
    if (userCtx.isGlobalAdmin || userCtx.primaryScope === 'GLOBAL') {
      return await outletRepo.listAllOutlets();
    }

    if (userCtx.primaryScope === 'STATE' && userCtx.accessibleStateIds.length > 0) {
      return await outletRepo.findOutletsByStateIds(userCtx.accessibleStateIds);
    }

    if (userCtx.primaryScope === 'DIVISION' && userCtx.accessibleDivisionIds.length > 0) {
      return await outletRepo.findOutletsByDivisionIds(userCtx.accessibleDivisionIds);
    }

    if (userCtx.primaryScope === 'SALES_AREA' && userCtx.accessibleSalesAreaIds.length > 0) {
      return await outletRepo.findOutletsBySalesAreaIds(userCtx.accessibleSalesAreaIds);
    }

    if (userCtx.primaryScope === 'OUTLET' && userCtx.accessibleOutletIds.length > 0) {
      return await outletRepo.findOutletsByIds(userCtx.accessibleOutletIds);
    }

    return [];
  }

  /**
   * Centralized verification if a user can access a specific outlet.
   */
  static async canAccessOutlet(
    userCtx: UserContext,
    outletId: string,
    outletRepo: OutletRepository
  ): Promise<boolean> {
    if (userCtx.isGlobalAdmin || userCtx.primaryScope === 'GLOBAL') {
      return true;
    }

    const outlet = await outletRepo.findById(outletId);
    if (!outlet) return false;

    if (userCtx.primaryScope === 'STATE') {
      return userCtx.accessibleStateIds.includes(outlet.stateId);
    }

    if (userCtx.primaryScope === 'DIVISION') {
      return userCtx.accessibleDivisionIds.includes(outlet.divisionId);
    }

    if (userCtx.primaryScope === 'SALES_AREA') {
      return userCtx.accessibleSalesAreaIds.includes(outlet.salesAreaId);
    }

    if (userCtx.primaryScope === 'OUTLET') {
      return userCtx.accessibleOutletIds.includes(outlet.id);
    }

    return false;
  }

  /**
   * Centralized resolution of users accessible under current scope.
   */
  static async getAccessibleUsers(
    userCtx: UserContext,
    userRepo: UserRepository,
    scopeRepo: ScopeRepository
  ): Promise<User[]> {
    const allUsers = await userRepo.listAllUsers();
    if (userCtx.isGlobalAdmin || userCtx.primaryScope === 'GLOBAL') {
      return allUsers;
    }

    const allScopes = await scopeRepo.listAllScopes();
    const accessibleUserIds = new Set<string>();
    accessibleUserIds.add(userCtx.user.id); // Always include self

    for (const scope of allScopes) {
      if (userCtx.primaryScope === 'STATE' && scope.stateId && userCtx.accessibleStateIds.includes(scope.stateId)) {
        accessibleUserIds.add(scope.userId);
      } else if (userCtx.primaryScope === 'DIVISION' && scope.divisionId && userCtx.accessibleDivisionIds.includes(scope.divisionId)) {
        accessibleUserIds.add(scope.userId);
      } else if (userCtx.primaryScope === 'SALES_AREA' && scope.salesAreaId && userCtx.accessibleSalesAreaIds.includes(scope.salesAreaId)) {
        accessibleUserIds.add(scope.userId);
      } else if (userCtx.primaryScope === 'OUTLET' && scope.outletId && userCtx.accessibleOutletIds.includes(scope.outletId)) {
        accessibleUserIds.add(scope.userId);
      }
    }

    return allUsers.filter(u => accessibleUserIds.has(u.id));
  }

  /**
   * Server-side parent-child hierarchy validation for new scope assignments.
   * Ensures that:
   * - A Sales Area belongs to its specified Division
   * - A Division belongs to its specified State
   * - An Outlet belongs to its specified Sales Area/Division/State
   */
  static async validateScopeAssignment(
    scopeLevel: ScopeLevel,
    stateId: string | null | undefined,
    divisionId: string | null | undefined,
    salesAreaId: string | null | undefined,
    outletId: string | null | undefined,
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<{ valid: boolean; message?: string }> {
    if (scopeLevel === 'GLOBAL') {
      return { valid: true };
    }

    if (scopeLevel === 'STATE') {
      if (!stateId) return { valid: false, message: 'State ID is required for STATE scope' };
      const st = await hierarchyRepo.findStateById(stateId);
      if (!st) return { valid: false, message: 'Invalid State ID' };
      return { valid: true };
    }

    if (scopeLevel === 'DIVISION') {
      if (!divisionId) return { valid: false, message: 'Division ID is required for DIVISION scope' };
      const div = await hierarchyRepo.findDivisionById(divisionId);
      if (!div) return { valid: false, message: 'Invalid Division ID' };
      if (stateId && div.stateId !== stateId) {
        return { valid: false, message: `Division ${div.name} does not belong to the selected State` };
      }
      return { valid: true };
    }

    if (scopeLevel === 'SALES_AREA') {
      if (!salesAreaId) return { valid: false, message: 'Sales Area ID is required for SALES_AREA scope' };
      const sa = await hierarchyRepo.findSalesAreaById(salesAreaId);
      if (!sa) return { valid: false, message: 'Invalid Sales Area ID' };
      if (divisionId && sa.divisionId !== divisionId) {
        return { valid: false, message: `Sales Area ${sa.name} does not belong to the selected Division` };
      }
      return { valid: true };
    }

    if (scopeLevel === 'OUTLET') {
      if (!outletId) return { valid: false, message: 'Outlet ID is required for OUTLET scope' };
      const outlet = await outletRepo.findById(outletId);
      if (!outlet) return { valid: false, message: 'Invalid Outlet ID' };
      if (salesAreaId && outlet.salesAreaId !== salesAreaId) {
        return { valid: false, message: `Outlet ${outlet.name} does not belong to the selected Sales Area` };
      }
      if (divisionId && outlet.divisionId !== divisionId) {
        return { valid: false, message: `Outlet ${outlet.name} does not belong to the selected Division` };
      }
      return { valid: true };
    }

    return { valid: false, message: 'Invalid scope level configuration' };
  }
}
