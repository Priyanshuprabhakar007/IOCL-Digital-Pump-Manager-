import { Hono } from 'hono';
import { getDb } from '../../db';
import { ScopeRepository } from '../repositories/scopeRepository';
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
  const allScopes = await scopeRepo.listAllScopes();

  return c.json({
    success: true,
    data: allScopes,
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
        message: 'Invalid scope payload',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const scopeRepo = new ScopeRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  // Validate Parent Hierarchy Relationships
  const validation = await ScopeService.validateScopeAssignment(
    payload.scopeLevel,
    payload.stateId,
    payload.divisionId,
    payload.salesAreaId,
    payload.outletId,
    hierarchyRepo,
    outletRepo
  );

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

  const nowIso = new Date().toISOString();
  const created = await scopeRepo.createScopeAssignment({
    id: `usa-${crypto.randomUUID()}`,
    userId: payload.userId,
    scopeLevel: payload.scopeLevel,
    stateId: payload.stateId,
    divisionId: payload.divisionId,
    salesAreaId: payload.salesAreaId,
    outletId: payload.outletId,
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
  const auditRepo = new AuditRepository(db);

  const nowIso = new Date().toISOString();
  await scopeRepo.deleteScopeAssignment(scopeId);

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'USER_SCOPE_DELETE',
    entityType: 'USER_SCOPE_ASSIGNMENT',
    entityId: scopeId,
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
