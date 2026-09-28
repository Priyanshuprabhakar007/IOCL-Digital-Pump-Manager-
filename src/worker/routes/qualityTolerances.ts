import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { QualityToleranceSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';
import { parseMilliunits } from '../../shared/precision';
import { QualityScopeType } from '../../shared/types';

export const qualityTolerances = new Hono<{ Bindings: EnvBindings }>();

qualityTolerances.use('*', requireAuth as any);

// GET /api/v1/quality-tolerances - List quality tolerance settings
qualityTolerances.get('/quality-tolerances', requirePermission(PERMISSIONS.QUALITY_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);

  const scopeType = c.req.query('scopeType') as QualityScopeType | undefined;
  const scopeEntityId = c.req.query('scopeEntityId');

  const list = await pumpRepo.listQualityTolerances(scopeType, scopeEntityId);
  return c.json({ success: true, data: list, error: null });
});

// GET /api/v1/quality-tolerances/:id - Get quality tolerance by ID
qualityTolerances.get('/quality-tolerances/:id', requirePermission(PERMISSIONS.QUALITY_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);

  const setting = await pumpRepo.findQualityToleranceById(id);
  if (!setting) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Quality tolerance setting not found' } }, 404);
  }

  return c.json({ success: true, data: setting, error: null });
});

// POST /api/v1/quality-tolerances - Create quality tolerance rule
qualityTolerances.post('/quality-tolerances', requirePermission(PERMISSIONS.QUALITY_TOLERANCE_MANAGE) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

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

  // Validate scope entity constraints
  if (scopeType !== 'GLOBAL' && (!scopeEntityId || scopeEntityId.trim().length === 0)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: `scopeEntityId is required for ${scopeType} scope type` },
    }, 400);
  }

  const tolMilli = parseMilliunits(densityTolerance);
  const nowIso = new Date().toISOString();
  const id = `qts-${crypto.randomUUID()}`;

  const created = await pumpRepo.createQualityTolerance({
    id,
    scopeType,
    scopeEntityId: scopeType === 'GLOBAL' ? null : scopeEntityId,
    productId: productId || null,
    densityToleranceMilliunits: tolMilli,
    status: status || 'ACTIVE',
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

  const existing = await pumpRepo.findQualityToleranceById(id);
  if (!existing) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Quality tolerance setting not found' } }, 404);
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

  const existing = await pumpRepo.findQualityToleranceById(id);
  if (!existing) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Quality tolerance setting not found' } }, 404);
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
