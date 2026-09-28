import { Hono } from 'hono';
import { getDb } from '../../db';
import { HierarchyRepository } from '../repositories/hierarchyRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { ScopeService } from '../services/scopeService';
import { StateSchema, DivisionSchema, SalesAreaSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';

const hierarchy = new Hono<{ Bindings: EnvBindings }>();

hierarchy.use('*', requireAuth as any);

// States - Safe Ancestor Visibility for Navigation & Breadcrumbs
hierarchy.get('/states', async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const repo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);
  const allStates = await repo.listStates();

  if (c.var.user.isGlobalScope) {
    return c.json({ success: true, data: allStates, error: null });
  }

  // Derive visible state IDs (includes assigned states and ancestor states for child scopes)
  const visibleStateIds = await ScopeService.getVisibleStateIds(c.var.user, repo, outletRepo);
  const filtered = allStates.filter(st => visibleStateIds.includes(st.id));

  return c.json({
    success: true,
    data: filtered,
    error: null,
  });
});

hierarchy.post('/states', requirePermission(PERMISSIONS.HIERARCHY_WRITE) as any, async (c: AppContext) => {
  if (!c.var.user.isGlobalScope) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Only GLOBAL accounts can register new State Offices.' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = StateSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid state payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const db = getDb(c.env.DB);
  const repo = new HierarchyRepository(db);
  const auditRepo = new AuditRepository(db);

  const nowIso = new Date().toISOString();
  const created = await repo.createState({
    id: `st-${crypto.randomUUID()}`,
    code: parseResult.data.code.toUpperCase(),
    name: parseResult.data.name,
    status: parseResult.data.status,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'STATE_CREATE',
    entityType: 'STATE',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// Divisions - Safe Ancestor Visibility
hierarchy.get('/divisions', async (c: AppContext) => {
  const stateId = c.req.query('stateId');
  const db = getDb(c.env.DB);
  const repo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);
  const allDivisions = await repo.listDivisions(stateId);

  if (c.var.user.isGlobalScope) {
    return c.json({ success: true, data: allDivisions, error: null });
  }

  const visibleDivIds = await ScopeService.getVisibleDivisionIds(c.var.user, repo, outletRepo);
  const filtered = allDivisions.filter(div => visibleDivIds.includes(div.id));

  return c.json({
    success: true,
    data: filtered,
    error: null,
  });
});

hierarchy.post('/divisions', requirePermission(PERMISSIONS.HIERARCHY_WRITE) as any, async (c: AppContext) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = DivisionSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid division payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const db = getDb(c.env.DB);
  const repo = new HierarchyRepository(db);
  const auditRepo = new AuditRepository(db);

  // STRICT OPERATIONAL AUTHORIZATION: Visible ancestor does NOT grant creation rights
  if (!await ScopeService.canAccessState(c.var.user, parseResult.data.stateId)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot register Divisional Office outside your assigned State.' } }, 403);
  }

  const parentState = await repo.findStateById(parseResult.data.stateId);
  if (!parentState) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_PARENT', message: 'Parent State Office does not exist.' },
    }, 400);
  }

  const nowIso = new Date().toISOString();
  const created = await repo.createDivision({
    id: `div-${crypto.randomUUID()}`,
    stateId: parseResult.data.stateId,
    code: parseResult.data.code.toUpperCase(),
    name: parseResult.data.name,
    status: parseResult.data.status,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'DIVISION_CREATE',
    entityType: 'DIVISION',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// Sales Areas - Safe Ancestor Visibility
hierarchy.get('/sales-areas', async (c: AppContext) => {
  const divisionId = c.req.query('divisionId');
  const db = getDb(c.env.DB);
  const repo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);
  const allSalesAreas = await repo.listSalesAreas(divisionId);

  if (c.var.user.isGlobalScope) {
    return c.json({ success: true, data: allSalesAreas, error: null });
  }

  const visibleSaIds = await ScopeService.getVisibleSalesAreaIds(c.var.user, repo, outletRepo);
  const filtered = allSalesAreas.filter(sa => visibleSaIds.includes(sa.id));

  return c.json({
    success: true,
    data: filtered,
    error: null,
  });
});

hierarchy.post('/sales-areas', requirePermission(PERMISSIONS.HIERARCHY_WRITE) as any, async (c: AppContext) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = SalesAreaSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid sales area payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const db = getDb(c.env.DB);
  const repo = new HierarchyRepository(db);
  const auditRepo = new AuditRepository(db);

  // STRICT OPERATIONAL AUTHORIZATION
  if (!await ScopeService.canAccessDivision(c.var.user, parseResult.data.divisionId, repo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot register Sales Area outside your assigned Divisional Office.' } }, 403);
  }

  const parentDiv = await repo.findDivisionById(parseResult.data.divisionId);
  if (!parentDiv) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_PARENT', message: 'Parent Divisional Office does not exist.' },
    }, 400);
  }

  const nowIso = new Date().toISOString();
  const created = await repo.createSalesArea({
    id: `sa-${crypto.randomUUID()}`,
    divisionId: parseResult.data.divisionId,
    code: parseResult.data.code.toUpperCase(),
    name: parseResult.data.name,
    status: parseResult.data.status,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'SALES_AREA_CREATE',
    entityType: 'SALES_AREA',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

export default hierarchy;
