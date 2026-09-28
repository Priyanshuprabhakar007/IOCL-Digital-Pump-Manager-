import { Hono } from 'hono';
import { getDb } from '../../db';
import { OutletRepository } from '../repositories/outletRepository';
import { HierarchyRepository } from '../repositories/hierarchyRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { requireOutletAccess } from '../middleware/scope';
import { ScopeService } from '../services/scopeService';
import { RetailOutletSchema, OutletUserAssignmentSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';

const outlets = new Hono<{ Bindings: EnvBindings }>();

outlets.use('*', requireAuth as any);

outlets.get('/', requirePermission(PERMISSIONS.OUTLETS_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);

  const accessibleOutlets = await ScopeService.getAccessibleOutlets(c.var.user, outletRepo);

  const listWithAssignments = await Promise.all(
    accessibleOutlets.map(async (o) => {
      const assignments = await outletRepo.listOutletAssignments(o.id);
      return {
        ...o,
        assignedUsersCount: assignments.length,
        assignments,
      };
    })
  );

  return c.json({
    success: true,
    data: listWithAssignments,
    error: null,
  });
});

outlets.get('/:id', requirePermission(PERMISSIONS.OUTLETS_READ) as any, requireOutletAccess('id') as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'ID required' } }, 400);
  }
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);

  const outlet = await outletRepo.findById(id);
  if (!outlet) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Retail outlet not found' },
    }, 404);
  }

  const assignments = await outletRepo.listOutletAssignments(id);

  return c.json({
    success: true,
    data: {
      ...outlet,
      assignments,
    },
    error: null,
  });
});

outlets.post('/', requirePermission(PERMISSIONS.OUTLETS_CREATE) as any, async (c: AppContext) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = RetailOutletSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid retail outlet payload',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const auditRepo = new AuditRepository(db);

  // Validate organizational parent chain
  const sa = await hierarchyRepo.findSalesAreaById(payload.salesAreaId);
  if (!sa || sa.divisionId !== payload.divisionId || sa.stateId !== payload.stateId) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'INVALID_HIERARCHY',
        message: 'The selected Sales Area does not match the provided State and Division hierarchy.',
      },
    }, 400);
  }

  if (!await ScopeService.canAccessSalesArea(c.var.user, payload.salesAreaId, hierarchyRepo)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Cannot register outlet outside your assigned Sales Area.' },
    }, 403);
  }

  const nowIso = new Date().toISOString();
  const created = await outletRepo.createOutlet({
    id: `ro-${crypto.randomUUID()}`,
    roCode: payload.roCode.toUpperCase(),
    name: payload.name,
    outletType: payload.outletType,
    stateId: payload.stateId,
    divisionId: payload.divisionId,
    salesAreaId: payload.salesAreaId,
    address: payload.address,
    city: payload.city,
    district: payload.district,
    pincode: payload.pincode,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    status: payload.status,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'OUTLET_CREATE',
    entityType: 'RETAIL_OUTLET',
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

outlets.post('/:id/assignments', requirePermission(PERMISSIONS.OUTLETS_UPDATE) as any, requireOutletAccess('id') as any, async (c: AppContext) => {
  const outletId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parseResult = OutletUserAssignmentSchema.safeParse({ ...body, outletId });

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid assignment payload',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const nowIso = new Date().toISOString();
  const createdAssignment = await outletRepo.createOutletUserAssignment({
    id: `oua-${crypto.randomUUID()}`,
    outletId: payload.outletId,
    userId: payload.userId,
    assignmentType: payload.assignmentType,
    effectiveFrom: payload.effectiveFrom || nowIso,
    effectiveTo: payload.effectiveTo || null,
    isActive: true,
    createdAt: nowIso,
    createdBy: c.var.user.user.id,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'OUTLET_USER_ASSIGNMENT_CREATE',
    entityType: 'OUTLET_USER_ASSIGNMENT',
    entityId: createdAssignment.id,
    newValue: createdAssignment as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: createdAssignment,
    error: null,
  });
});

export default outlets;
