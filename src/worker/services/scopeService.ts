import { UserContext, RetailOutlet, ScopeLevel, User, UserScopeAssignment, State, Division, SalesArea } from '../../shared/types';
import { OutletRepository } from '../repositories/outletRepository';
import { UserRepository } from '../repositories/userRepository';
import { ScopeRepository } from '../repositories/scopeRepository';
import { HierarchyRepository } from '../repositories/hierarchyRepository';

export interface ScopeAncestry {
  stateId: string | null;
  divisionId: string | null;
  salesAreaId: string | null;
  outletId: string | null;
}

export class ScopeService {
  // ==========================================================================
  // DIRECT AUTHORIZATION SCOPE HELPERS (STRICT - DO NOT CONFUSE WITH VISIBILITY)
  // ==========================================================================

  static getAccessibleStateIds(userCtx: UserContext): string[] {
    return userCtx.accessibleStateIds;
  }

  static getAccessibleDivisionIds(userCtx: UserContext): string[] {
    return userCtx.accessibleDivisionIds;
  }

  static getAccessibleSalesAreaIds(userCtx: UserContext): string[] {
    return userCtx.accessibleSalesAreaIds;
  }

  static getAccessibleOutletIds(userCtx: UserContext): string[] {
    return userCtx.accessibleOutletIds;
  }

  /**
   * AUTHORIZATION CHECK: Check if actor has administrative / operational scope access to an entire State.
   */
  static async canAccessState(
    userCtx: UserContext,
    stateId: string
  ): Promise<boolean> {
    if (userCtx.isGlobalScope) return true;
    return userCtx.accessibleStateIds.includes(stateId);
  }

  /**
   * AUTHORIZATION CHECK: Check if actor has scope access to an entire Division.
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
   * AUTHORIZATION CHECK: Check if actor has scope access to an entire Sales Area.
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

    const div = await hierarchyRepo.findDivisionById(sa.divisionId);
    if (div && userCtx.accessibleStateIds.includes(div.stateId)) return true;

    return false;
  }

  /**
   * AUTHORIZATION CHECK: Check if actor has scope access to a specific Outlet.
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

  // ==========================================================================
  // SERVER-SIDE ANCESTRY RESOLUTION FOR SCOPE ASSIGNMENTS
  // ==========================================================================

  /**
   * Resolves the full ancestry (state, division, sales area, outlet) for any scope assignment
   * strictly server-side, without storing redundant parent IDs in the database.
   */
  static async resolveScopeAncestry(
    scope: UserScopeAssignment,
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<ScopeAncestry> {
    if (scope.scopeLevel === 'GLOBAL') {
      return { stateId: null, divisionId: null, salesAreaId: null, outletId: null };
    }

    if (scope.scopeLevel === 'STATE') {
      return { stateId: scope.stateId, divisionId: null, salesAreaId: null, outletId: null };
    }

    if (scope.scopeLevel === 'DIVISION' && scope.divisionId) {
      const div = await hierarchyRepo.findDivisionById(scope.divisionId);
      return {
        stateId: div ? div.stateId : null,
        divisionId: scope.divisionId,
        salesAreaId: null,
        outletId: null,
      };
    }

    if (scope.scopeLevel === 'SALES_AREA' && scope.salesAreaId) {
      const sa = await hierarchyRepo.findSalesAreaById(scope.salesAreaId);
      let stateId: string | null = null;
      if (sa) {
        const div = await hierarchyRepo.findDivisionById(sa.divisionId);
        stateId = div ? div.stateId : null;
      }
      return {
        stateId,
        divisionId: sa ? sa.divisionId : null,
        salesAreaId: scope.salesAreaId,
        outletId: null,
      };
    }

    if (scope.scopeLevel === 'OUTLET' && scope.outletId) {
      const outlet = await outletRepo.findById(scope.outletId);
      return {
        stateId: outlet ? outlet.stateId : null,
        divisionId: outlet ? outlet.divisionId : null,
        salesAreaId: outlet ? outlet.salesAreaId : null,
        outletId: scope.outletId,
      };
    }

    return { stateId: null, divisionId: null, salesAreaId: null, outletId: null };
  }

  /**
   * Evaluates if a given scope assignment falls within an actor's organizational authority.
   */
  static async isScopeWithinActorAuthority(
    actorCtx: UserContext,
    scope: UserScopeAssignment,
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<boolean> {
    if (actorCtx.isGlobalScope) return true;

    // Non-global actor cannot administer GLOBAL scope
    if (scope.scopeLevel === 'GLOBAL') return false;

    const ancestry = await ScopeService.resolveScopeAncestry(scope, hierarchyRepo, outletRepo);

    if (scope.scopeLevel === 'STATE') {
      return Boolean(scope.stateId && actorCtx.accessibleStateIds.includes(scope.stateId));
    }

    if (scope.scopeLevel === 'DIVISION') {
      if (scope.divisionId && actorCtx.accessibleDivisionIds.includes(scope.divisionId)) return true;
      if (ancestry.stateId && actorCtx.accessibleStateIds.includes(ancestry.stateId)) return true;
      return false;
    }

    if (scope.scopeLevel === 'SALES_AREA') {
      if (scope.salesAreaId && actorCtx.accessibleSalesAreaIds.includes(scope.salesAreaId)) return true;
      if (ancestry.divisionId && actorCtx.accessibleDivisionIds.includes(ancestry.divisionId)) return true;
      if (ancestry.stateId && actorCtx.accessibleStateIds.includes(ancestry.stateId)) return true;
      return false;
    }

    if (scope.scopeLevel === 'OUTLET') {
      if (scope.outletId && actorCtx.accessibleOutletIds.includes(scope.outletId)) return true;
      if (ancestry.salesAreaId && actorCtx.accessibleSalesAreaIds.includes(ancestry.salesAreaId)) return true;
      if (ancestry.divisionId && actorCtx.accessibleDivisionIds.includes(ancestry.divisionId)) return true;
      if (ancestry.stateId && actorCtx.accessibleStateIds.includes(ancestry.stateId)) return true;
      return false;
    }

    return false;
  }

  // ==========================================================================
  // REQUIREMENT 1: USER SCOPE ANCESTRY & ACCESSIBLE USERS
  // ==========================================================================

  /**
   * Resolves users accessible under actor's scope boundaries.
   * Derives hierarchy relationships:
   * A STATE actor recognizes users scoped to child DIVISION, SALES_AREA, OUTLET.
   * A DIVISION actor recognizes users scoped to child SALES_AREA, OUTLET.
   * A SALES_AREA actor recognizes users scoped to child OUTLET.
   */
  static async getAccessibleUsers(
    actorCtx: UserContext,
    userRepo: UserRepository,
    scopeRepo: ScopeRepository,
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<User[]> {
    const allUsers = await userRepo.listAllUsers();
    if (actorCtx.isGlobalScope) {
      return allUsers;
    }

    const allScopes = await scopeRepo.listAllScopes();
    const accessibleUserIds = new Set<string>();
    accessibleUserIds.add(actorCtx.user.id); // Always include self

    for (const scope of allScopes) {
      const isAccessible = await ScopeService.isScopeWithinActorAuthority(actorCtx, scope, hierarchyRepo, outletRepo);
      if (isAccessible) {
        accessibleUserIds.add(scope.userId);
      }
    }

    return allUsers.filter(u => accessibleUserIds.has(u.id));
  }

  // ==========================================================================
  // REQUIREMENT 2: SAFE MULTI-SCOPE USER ADMINISTRATION
  // ==========================================================================

  /**
   * Explicit function to check if actor can view target user details.
   */
  static async canViewUser(
    actorCtx: UserContext,
    targetUserId: string,
    userRepo: UserRepository,
    scopeRepo: ScopeRepository,
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<boolean> {
    if (actorCtx.user.id === targetUserId) return true;
    if (actorCtx.isGlobalScope) return true;

    const accessible = await ScopeService.getAccessibleUsers(actorCtx, userRepo, scopeRepo, hierarchyRepo, outletRepo);
    return accessible.some(u => u.id === targetUserId);
  }

  /**
   * Explicit function to check if actor can modify target user (e.g. status change, updates).
   * CRITICAL: A target user can have multiple independent scopes.
   * Do not allow a non-global administrator to manage a target simply because ONE of the target's
   * scopes overlaps. For destructive or privilege-changing operations, ALL target user scopes
   * MUST fall within the actor's authority!
   */
  static async canModifyUser(
    actorCtx: UserContext,
    targetUserId: string,
    userRepo: UserRepository,
    scopeRepo: ScopeRepository,
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<boolean> {
    if (actorCtx.user.id === targetUserId) {
      return false; // Prevent self status disable / self privilege change
    }

    if (actorCtx.isGlobalScope) {
      return true;
    }

    // Role ceiling verification: actor cannot modify a user whose role level exceeds or equals actor
    const targetRoles = await userRepo.getUserRoles(targetUserId);
    const targetMaxRoleLevel = Math.max(...targetRoles.map(r => ScopeService.getRoleLevel(r)), 0);
    const actorMaxRoleLevel = Math.max(...actorCtx.roles.map(r => ScopeService.getRoleLevel(r)), 0);
    if (targetMaxRoleLevel > actorMaxRoleLevel) {
      return false;
    }

    const targetScopes = await scopeRepo.getUserScopes(targetUserId);
    if (targetScopes.length === 0) {
      // If user has no scopes, they can only be managed if actor can view them and role level allows
      const canView = await ScopeService.canViewUser(actorCtx, targetUserId, userRepo, scopeRepo, hierarchyRepo, outletRepo);
      return canView;
    }

    // Target user must not hold GLOBAL scope
    if (targetScopes.some(s => s.scopeLevel === 'GLOBAL')) {
      return false;
    }

    // EVERY SINGLE SCOPE of the target user must fall strictly within the actor's organizational authority!
    for (const scope of targetScopes) {
      const isCovered = await ScopeService.isScopeWithinActorAuthority(actorCtx, scope, hierarchyRepo, outletRepo);
      if (!isCovered) {
        return false; // Actor does not have jurisdiction over this specific target scope!
      }
    }

    return true;
  }

  /**
   * Explicit function to check if actor can delete a specific scope assignment record.
   * A West Bengal administrator must not be able to delete a Punjab scope merely because
   * the same user also has a West Bengal scope.
   */
  static async canDeleteScopeAssignment(
    actorCtx: UserContext,
    targetScope: UserScopeAssignment,
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<boolean> {
    if (actorCtx.isGlobalScope) {
      return true;
    }

    // Users cannot revoke their own organizational scope assignments
    if (targetScope.userId === actorCtx.user.id) {
      return false;
    }

    // Ensure actor has authority over the EXACT target scope assignment
    return await ScopeService.isScopeWithinActorAuthority(actorCtx, targetScope, hierarchyRepo, outletRepo);
  }

  /**
   * Backward-compatible alias used in legacy routes.
   */
  static async canManageUser(
    actorCtx: UserContext,
    targetUserId: string,
    userRepo: UserRepository,
    scopeRepo: ScopeRepository,
    hierarchyRepo?: HierarchyRepository,
    outletRepo?: OutletRepository
  ): Promise<boolean> {
    if (actorCtx.user.id === targetUserId) return true;
    if (actorCtx.isGlobalScope) return true;

    if (hierarchyRepo && outletRepo) {
      return await ScopeService.canModifyUser(actorCtx, targetUserId, userRepo, scopeRepo, hierarchyRepo, outletRepo);
    }

    const accessible = await ScopeService.getAccessibleUsers(actorCtx, userRepo, scopeRepo, hierarchyRepo!, outletRepo!);
    return accessible.some(u => u.id === targetUserId);
  }

  // ==========================================================================
  // REQUIREMENT 3: HIERARCHY ANCESTOR VISIBILITY (SEPARATE FROM AUTHORIZATION)
  // ==========================================================================

  /**
   * Derives the state IDs that are visible for navigation and breadcrumbs.
   * Includes the user's authorized states PLUS the parent states of their assigned
   * divisions, sales areas, or outlets.
   * NOTE: This does NOT grant operational access (canAccessState) to those states.
   */
  static async getVisibleStateIds(
    userCtx: UserContext,
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<string[]> {
    if (userCtx.isGlobalScope) {
      const states = await hierarchyRepo.listStates();
      return states.map(s => s.id);
    }

    const visibleStateIds = new Set<string>(userCtx.accessibleStateIds);

    // Parent states from accessible divisions
    for (const divId of userCtx.accessibleDivisionIds) {
      const div = await hierarchyRepo.findDivisionById(divId);
      if (div?.stateId) visibleStateIds.add(div.stateId);
    }

    // Parent states from accessible sales areas
    for (const saId of userCtx.accessibleSalesAreaIds) {
      const sa = await hierarchyRepo.findSalesAreaById(saId);
      if (sa) {
        const div = await hierarchyRepo.findDivisionById(sa.divisionId);
        if (div?.stateId) visibleStateIds.add(div.stateId);
      }
    }

    // Parent states from accessible outlets
    for (const outletId of userCtx.accessibleOutletIds) {
      const outlet = await outletRepo.findById(outletId);
      if (outlet?.stateId) visibleStateIds.add(outlet.stateId);
    }

    return Array.from(visibleStateIds);
  }

  /**
   * Derives the division IDs that are visible for navigation and breadcrumbs.
   */
  static async getVisibleDivisionIds(
    userCtx: UserContext,
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<string[]> {
    if (userCtx.isGlobalScope) {
      const divs = await hierarchyRepo.listDivisions();
      return divs.map(d => d.id);
    }

    const visibleDivIds = new Set<string>(userCtx.accessibleDivisionIds);

    // If user has state access, all divisions in that state are visible
    for (const stateId of userCtx.accessibleStateIds) {
      const stateDivs = await hierarchyRepo.listDivisions(stateId);
      stateDivs.forEach(d => visibleDivIds.add(d.id));
    }

    // Parent divisions from accessible sales areas
    for (const saId of userCtx.accessibleSalesAreaIds) {
      const sa = await hierarchyRepo.findSalesAreaById(saId);
      if (sa?.divisionId) visibleDivIds.add(sa.divisionId);
    }

    // Parent divisions from accessible outlets
    for (const outletId of userCtx.accessibleOutletIds) {
      const outlet = await outletRepo.findById(outletId);
      if (outlet?.divisionId) visibleDivIds.add(outlet.divisionId);
    }

    return Array.from(visibleDivIds);
  }

  /**
   * Derives the sales area IDs that are visible for navigation and breadcrumbs.
   */
  static async getVisibleSalesAreaIds(
    userCtx: UserContext,
    hierarchyRepo: HierarchyRepository,
    outletRepo: OutletRepository
  ): Promise<string[]> {
    if (userCtx.isGlobalScope) {
      const sas = await hierarchyRepo.listSalesAreas();
      return sas.map(sa => sa.id);
    }

    const visibleSaIds = new Set<string>(userCtx.accessibleSalesAreaIds);

    // If user has state access, all sales areas in that state's divisions are visible
    for (const stateId of userCtx.accessibleStateIds) {
      const stateDivs = await hierarchyRepo.listDivisions(stateId);
      for (const div of stateDivs) {
        const sas = await hierarchyRepo.listSalesAreas(div.id);
        sas.forEach(sa => visibleSaIds.add(sa.id));
      }
    }

    // If user has division access, all sales areas in that division are visible
    for (const divId of userCtx.accessibleDivisionIds) {
      const sas = await hierarchyRepo.listSalesAreas(divId);
      sas.forEach(sa => visibleSaIds.add(sa.id));
    }

    // Parent sales area from accessible outlets
    for (const outletId of userCtx.accessibleOutletIds) {
      const outlet = await outletRepo.findById(outletId);
      if (outlet?.salesAreaId) visibleSaIds.add(outlet.salesAreaId);
    }

    return Array.from(visibleSaIds);
  }

  // ==========================================================================
  // OUTLET RESOLUTION & ROLE CEILING
  // ==========================================================================

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

  static validateRoleCeiling(actorCtx: UserContext, targetRoles: string[]): { allowed: boolean; message?: string } {
    if (actorCtx.isGlobalScope) {
      return { allowed: true };
    }

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
