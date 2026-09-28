import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { HierarchyRepository } from '../repositories/hierarchyRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { QualityToleranceSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';
import { parseMilliunits } from '../../shared/precision';
import { QualityScopeType } from '../../shared/types';

export const qualityTolerances = new Hono<{ Bindings: EnvBindings }>();

qualityTolerances.use('*', requireAuth as any);

async function canManageQualityToleranceScope(
  c: AppContext,
  scopeType: QualityScopeType,
  scopeEntityId: string | null | undefined,
  hierarchyRepo: HierarchyRepository,
  outletRepo: OutletRepository
): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;

  const isAdmin = userCtx.roles.some((r: any) => typeof r === 'string' ? r === 'ADMIN' : r?.code === 'ADMIN');

  if (scopeType === 'GLOBAL') {
    return isAdmin && (userCtx.isGlobalScope || userCtx.primaryScope === 'GLOBAL' || userCtx.isGlobalAdmin);
  }

  if (scopeType === 'STATE') {
    if (isAdmin && userCtx.isGlobalScope) return true;
    if (!scopeEntityId) return false;
    return ScopeService.canAccessState(userCtx, scopeEntityId);
  }

  if (scopeType === 'DIVISION') {
    if (isAdmin && userCtx.isGlobalScope) return true;
    if (!scopeEntityId) return false;
    return ScopeService.canAccessDivision(userCtx, scopeEntityId, hierarchyRepo);
  }

  if (scopeType === 'OUTLET') {
    if (isAdmin && userCtx.isGlobalScope) return true;
    if (!scopeEntityId) return false;
    return ScopeService.canAccessOutlet(userCtx, scopeEntityId, outletRepo);
  }

  return false;
}

// GET /api/v1/quality-tolerances - List quality tolerance settings (scoped)
qualityTolerances.get('/quality-tolerances', requirePermission(PERMISSIONS.QUALITY_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);
  const userCtx = c.var.user!;

  const scopeType = c.req.query('scopeType') as QualityScopeType | undefined;
  const scopeEntityId = c.req.query('scopeEntityId');

  const rawList = await pumpRepo.listQualityTolerances(scopeType, scopeEntityId);

  const visibleList = [];
  for (const rule of rawList) {
    let isVisible = false;
    if (userCtx.isGlobalScope) {
      isVisible = true;
    } else if (rule.scopeType === 'GLOBAL') {
      isVisible = true;
    } else if (rule.scopeType === 'STATE' && rule.scopeEntityId) {
      isVisible = await ScopeService.canAccessState(userCtx, rule.scopeEntityId);
    } else if (rule.scopeType === 'DIVISION' && rule.scopeEntityId) {
      isVisible = await ScopeService.canAccessDivision(userCtx, rule.scopeEntityId, hierarchyRepo);
    } else if (rule.scopeType === 'OUTLET' && rule.scopeEntityId) {
      isVisible = await ScopeService.canAccessOutlet(userCtx, rule.scopeEntityId, outletRepo);
    }

    if (isVisible) visibleList.push(rule);
  }

  return c.json({ success: true, data: visibleList, error: null });
});

// GET /api/v1/quality-tolerances/:id - Get quality tolerance by ID
qualityTolerances.get('/quality-tolerances/:id', requirePermission(PERMISSIONS.QUALITY_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);
  const userCtx = c.var.user!;

  const setting = await pumpRepo.findQualityToleranceById(id);
  if (!setting) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Quality tolerance setting not found' } }, 404);
  }

  let isVisible = false;
  if (userCtx.isGlobalScope || setting.scopeType === 'GLOBAL') {
    isVisible = true;
  } else if (setting.scopeType === 'STATE' && setting.scopeEntityId) {
    isVisible = await ScopeService.canAccessState(userCtx, setting.scopeEntityId);
  } else if (setting.scopeType === 'DIVISION' && setting.scopeEntityId) {
    isVisible = await ScopeService.canAccessDivision(userCtx, setting.scopeEntityId, hierarchyRepo);
  } else if (setting.scopeType === 'OUTLET' && setting.scopeEntityId) {
    isVisible = await ScopeService.canAccessOutlet(userCtx, setting.scopeEntityId, outletRepo);
  }

  if (!isVisible) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this quality tolerance setting' } }, 403);
  }

  return c.json({ success: true, data: setting, error: null });
});

// POST /api/v1/quality-tolerances - Create quality tolerance rule
qualityTolerances.post('/quality-tolerances', requirePermission(PERMISSIONS.QUALITY_TOLERANCE_MANAGE) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);

  const body = await c.req.json().catch(() => ({}));
  const parseResult = QualityToleranceSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid tolerance payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { scopeType, scopeEntityId, productId, densityTolerance, status, effectiveFrom, effectiveTo } = parseResult.data;

  // 1. Validate scope entity presence
  if (scopeType !== 'GLOBAL' && (!scopeEntityId || scopeEntityId.trim().length === 0)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: `scopeEntityId is required for ${scopeType} scope type` },
    }, 400);
  }

  // 2. Strict RBAC scope authority check
  const hasAuth = await canManageQualityToleranceScope(c, scopeType, scopeEntityId, hierarchyRepo, outletRepo);
  if (!hasAuth) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have organizational authority to manage quality tolerances for this scope.' },
    }, 403);
  }

  // 3. Date validity check: effectiveTo >= effectiveFrom
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_EFFECTIVE_DATES', message: 'effective_to must be on or after effective_from.' },
    }, 400);
  }

  // 4. Overlap check for active rules at same scope + entity + product
  const targetEntityId = scopeType === 'GLOBAL' ? null : scopeEntityId || null;
  const targetProductId = productId || null;
  const targetStatus = status || 'ACTIVE';

  if (targetStatus === 'ACTIVE') {
    const existingRules = await pumpRepo.listQualityTolerances(scopeType, targetEntityId);
    const endA = effectiveTo || '9999-12-31';

    for (const r of existingRules) {
      if (r.status === 'ACTIVE' && (r.productId || null) === targetProductId) {
        const startB = r.effectiveFrom;
        const endB = r.effectiveTo || '9999-12-31';

        // If existing rule is open-ended and started before the new rule, bound its effectiveTo to day before effectiveFrom
        if (!r.effectiveTo && startB < effectiveFrom && (!effectiveTo || effectiveTo >= startB)) {
          const prevEndDate = new Date(new Date(effectiveFrom).getTime() - 86400000).toISOString().split('T')[0];
          await pumpRepo.updateQualityTolerance(r.id, { effectiveTo: prevEndDate });
          continue;
        }

        // Check date range overlap [effectiveFrom, endA] vs [startB, endB]
        if (effectiveFrom <= endB && endA >= startB) {
          return c.json({
            success: false,
            data: null,
            error: {
              code: 'OVERLAPPING_QUALITY_RULE',
              message: 'An active quality tolerance rule already exists for this scope and product with an overlapping effective period.',
            },
          }, 409);
        }
      }
    }
  }

  const tolMilli = parseMilliunits(densityTolerance);
  const nowIso = new Date().toISOString();
  const id = `qts-${crypto.randomUUID()}`;

  const created = await pumpRepo.createQualityTolerance({
    id,
    scopeType,
    scopeEntityId: targetEntityId,
    productId: targetProductId,
    densityToleranceMilliunits: tolMilli,
    status: targetStatus,
    effectiveFrom,
    effectiveTo: effectiveTo || null,
    createdAt: nowIso,
    createdBy: c.var.user!.user.id,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'QUALITY_TOLERANCE_CREATE',
    entityType: 'QUALITY_TOLERANCE',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// PUT /api/v1/quality-tolerances/:id - Update quality tolerance setting
qualityTolerances.put('/quality-tolerances/:id', requirePermission(PERMISSIONS.QUALITY_TOLERANCE_MANAGE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);

  const existing = await pumpRepo.findQualityToleranceById(id);
  if (!existing) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Quality tolerance setting not found' } }, 404);
  }

  // RBAC scope check on existing
  const hasExistingAuth = await canManageQualityToleranceScope(c, existing.scopeType, existing.scopeEntityId, hierarchyRepo, outletRepo);
  if (!hasExistingAuth) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'You do not have authority over this quality tolerance setting' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = QualityToleranceSchema.partial().safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const payload = parseResult.data;
  const targetScopeType = payload.scopeType || existing.scopeType;
  const targetScopeEntityId = payload.scopeEntityId !== undefined ? payload.scopeEntityId : existing.scopeEntityId;

  // RBAC check on new target scope
  const hasTargetAuth = await canManageQualityToleranceScope(c, targetScopeType, targetScopeEntityId, hierarchyRepo, outletRepo);
  if (!hasTargetAuth) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'You do not have authority over the updated scope' } }, 403);
  }

  const newFrom = payload.effectiveFrom || existing.effectiveFrom;
  const newTo = payload.effectiveTo !== undefined ? payload.effectiveTo : existing.effectiveTo;

  if (newTo && newTo < newFrom) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_EFFECTIVE_DATES', message: 'effective_to must be on or after effective_from.' },
    }, 400);
  }

  const updateData: any = { ...payload };
  if (payload.densityTolerance) {
    updateData.densityToleranceMilliunits = parseMilliunits(payload.densityTolerance);
    delete updateData.densityTolerance;
  }

  const updated = await pumpRepo.updateQualityTolerance(id, updateData);

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'QUALITY_TOLERANCE_UPDATE',
    entityType: 'QUALITY_TOLERANCE',
    entityId: id,
    oldValue: existing as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, data: updated, error: null });
});

// DELETE /api/v1/quality-tolerances/:id - Delete quality tolerance setting
qualityTolerances.delete('/quality-tolerances/:id', requirePermission(PERMISSIONS.QUALITY_TOLERANCE_MANAGE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);

  const existing = await pumpRepo.findQualityToleranceById(id);
  if (!existing) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Quality tolerance setting not found' } }, 404);
  }

  const hasAuth = await canManageQualityToleranceScope(c, existing.scopeType, existing.scopeEntityId, hierarchyRepo, outletRepo);
  if (!hasAuth) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'You do not have authority over this quality tolerance setting' } }, 403);
  }

  await pumpRepo.deleteQualityTolerance(id);

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'QUALITY_TOLERANCE_DELETE',
    entityType: 'QUALITY_TOLERANCE',
    entityId: id,
    oldValue: existing as unknown as Record<string, unknown>,
    newValue: null,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, data: { message: 'Quality tolerance setting deleted' }, error: null });
});

export default qualityTolerances;
