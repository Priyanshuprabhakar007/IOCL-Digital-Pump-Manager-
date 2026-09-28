import { Hono } from 'hono';
import { getDb } from '../../db';
import { ScopeRepository } from '../repositories/scopeRepository';
import { UserRepository } from '../repositories/userRepository';
import { HierarchyRepository } from '../repositories/hierarchyRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { ScopeService } from '../services/scopeService';
import { UserScopeAssignmentSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';

const scopes = new Hono<{ Bindings: EnvBindings }>();

scopes.use('*', requireAuth as any);

scopes.get('/', requirePermission(PERMISSIONS.SCOPES_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const scopeRepo = new ScopeRepository(db);
  const userRepo = new UserRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);

  const allScopes = await scopeRepo.listAllScopes();

  if (c.var.user.isGlobalScope) {
    return c.json({ success: true, data: allScopes, error: null });
  }

  // Filter scopes where actor has management authority over target user or target entity
  const filteredScopes = [];
  for (const s of allScopes) {
    let matches = false;
    if (s.stateId && await ScopeService.canAccessState(c.var.user, s.stateId)) matches = true;
    if (s.divisionId && await ScopeService.canAccessDivision(c.var.user, s.divisionId, hierarchyRepo)) matches = true;
    if (s.salesAreaId && await ScopeService.canAccessSalesArea(c.var.user, s.salesAreaId, hierarchyRepo)) matches = true;
    if (s.outletId && await ScopeService.canAccessOutlet(c.var.user, s.outletId, outletRepo)) matches = true;

    if (matches || s.userId === c.var.user.user.id) {
      filteredScopes.push(s);
    }
  }

  return c.json({
    success: true,
    data: filteredScopes,
    error: null,
  });
});

scopes.post('/', requirePermission(PERMISSIONS.SCOPES_ASSIGN) as any, async (c: AppContext) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = UserScopeAssignmentSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid scope assignment payload schema.',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const scopeRepo = new ScopeRepository(db);
  const userRepo = new UserRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  // Self Scope Elevation Check
  if (payload.userId === c.var.user.user.id && !c.var.user.isGlobalScope) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'You cannot assign or elevate organizational scopes for your own account.' },
    }, 403);
  }

  // Actor Scope Broadness Check: Non-GLOBAL users cannot assign GLOBAL scope
  if (payload.scopeLevel === 'GLOBAL' && !c.var.user.isGlobalScope) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Only accounts with GLOBAL scope authority can assign GLOBAL scopes.' },
    }, 403);
  }

  // Manage Target User Check
  const canManageTarget = await ScopeService.canManageUser(c.var.user, payload.userId, userRepo, scopeRepo);
  if (!canManageTarget) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Target user is outside your authorized administrative scope.' },
    }, 403);
  }

  // Server-Side Parent Ancestry Derivation & Hierarchy Validation
  const validation = await ScopeService.validateAndDeriveScope(payload, hierarchyRepo, outletRepo);
  if (!validation.valid) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'INVALID_SCOPE_HIERARCHY',
        message: validation.message || 'Invalid organizational hierarchy relationship for specified scope.',
      },
    }, 400);
  }

  const { derived } = validation;

  // Actor Scope Authority Check over target entity
  if (payload.scopeLevel === 'STATE' && derived.stateId) {
    if (!await ScopeService.canAccessState(c.var.user, derived.stateId)) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot assign scope outside your assigned State Office.' } }, 403);
    }
  } else if (payload.scopeLevel === 'DIVISION' && derived.divisionId) {
    if (!await ScopeService.canAccessDivision(c.var.user, derived.divisionId, hierarchyRepo)) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot assign scope outside your assigned Divisional Office.' } }, 403);
    }
  } else if (payload.scopeLevel === 'SALES_AREA' && derived.salesAreaId) {
    if (!await ScopeService.canAccessSalesArea(c.var.user, derived.salesAreaId, hierarchyRepo)) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot assign scope outside your assigned Sales Area.' } }, 403);
    }
  } else if (payload.scopeLevel === 'OUTLET' && derived.outletId) {
    if (!await ScopeService.canAccessOutlet(c.var.user, derived.outletId, outletRepo)) {
      return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot assign scope for an outlet outside your assigned scope.' } }, 403);
    }
  }

  const nowIso = new Date().toISOString();
  const created = await scopeRepo.createScopeAssignment({
    id: `usa-${crypto.randomUUID()}`,
    userId: payload.userId,
    scopeLevel: payload.scopeLevel,
    stateId: derived.stateId,
    divisionId: derived.divisionId,
    salesAreaId: derived.salesAreaId,
    outletId: derived.outletId,
    createdAt: nowIso,
    createdBy: c.var.user.user.id,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'USER_SCOPE_ASSIGN',
    entityType: 'USER_SCOPE_ASSIGNMENT',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: created,
    error: null,
  });
});

scopes.delete('/:id', requirePermission(PERMISSIONS.SCOPES_ASSIGN) as any, async (c: AppContext) => {
  const scopeId = c.req.param('id');
  if (!scopeId) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Scope ID required' } }, 400);
  }

  const db = getDb(c.env.DB);
  const scopeRepo = new ScopeRepository(db);
  const userRepo = new UserRepository(db);
  const auditRepo = new AuditRepository(db);

  // Fetch scope first and verify actor authority before deletion!
  const allScopes = await scopeRepo.listAllScopes();
  const targetScope = allScopes.find(s => s.id === scopeId);
  if (!targetScope) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Scope assignment record not found' } }, 404);
  }

  // Prevent self scope deletion if non-global
  if (targetScope.userId === c.var.user.user.id && !c.var.user.isGlobalScope) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'You cannot revoke your own organizational scope assignments.' } }, 403);
  }

  const canManageTarget = await ScopeService.canManageUser(c.var.user, targetScope.userId, userRepo, scopeRepo);
  if (!canManageTarget) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'You do not have administrative authority to manage this target user.' } }, 403);
  }

  const nowIso = new Date().toISOString();
  await scopeRepo.deleteScopeAssignment(scopeId);

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'USER_SCOPE_DELETE',
    entityType: 'USER_SCOPE_ASSIGNMENT',
    entityId: scopeId,
    oldValue: targetScope as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: { message: 'Scope assignment removed successfully' },
    error: null,
  });
});

export default scopes;
