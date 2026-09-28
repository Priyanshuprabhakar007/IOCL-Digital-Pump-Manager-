import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  OutletProductSchema,
  TankSchema,
  TankUpdateSchema,
  DispenserSchema,
  DispenserUpdateSchema,
  NozzleSchema,
  NozzleUpdateSchema,
  ShiftTemplateSchema,
} from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';

export const pumpOperations = new Hono<{ Bindings: EnvBindings }>();

pumpOperations.use('*', requireAuth as any);

// Scope check helper
async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

// ==========================================
// 1. OUTLET PRODUCT MAPPINGS
// ==========================================

// GET /api/v1/outlets/:outletId/products
pumpOperations.get('/outlets/:outletId/products', requirePermission(PERMISSIONS.OUTLET_PRODUCTS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const list = await pumpRepo.listOutletProducts(outletId);
  return c.json({ success: true, data: list, error: null });
});

// POST /api/v1/outlets/:outletId/products
pumpOperations.post('/outlets/:outletId/products', requirePermission(PERMISSIONS.OUTLET_PRODUCTS_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = OutletProductSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() } }, 400);
  }

  const { productId, status } = parseResult.data;

  // Verify product exists in global catalog
  const prod = await pumpRepo.findProductById(productId);
  if (!prod) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Product not found in global catalog' } }, 404);
  }

  // Check if mapping already exists
  const existing = await pumpRepo.findOutletProduct(outletId, productId);
  if (existing) {
    return c.json({ success: false, data: null, error: { code: 'CONFLICT', message: 'Product already mapped to this outlet' } }, 409);
  }

  const nowIso = new Date().toISOString();
  const created = await pumpRepo.mapProductToOutlet({
    id: `op-${crypto.randomUUID()}`,
    outletId,
    productId,
    status,
    createdAt: nowIso,
    createdBy: c.var.user!.user.id,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'OUTLET_PRODUCT_MAP',
    entityType: 'OUTLET_PRODUCT',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// PATCH /api/v1/outlets/:outletId/products/:productId/status
pumpOperations.patch('/outlets/:outletId/products/:productId/status', requirePermission(PERMISSIONS.OUTLET_PRODUCTS_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  const productId = c.req.param('productId');
  if (!outletId || !productId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId and productId are required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const status = body?.status;
  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: "status must be 'ACTIVE' or 'INACTIVE'" } }, 400);
  }

  const existing = await pumpRepo.findOutletProduct(outletId, productId);
  if (!existing) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Outlet product mapping not found' } }, 404);
  }

  // Phase 2A Hardening: If deactivating, check active tanks/nozzles
  if (status === 'INACTIVE') {
    const activeDependents = await pumpRepo.findActiveTanksAndNozzlesForOutletProduct(outletId, productId);
    if (activeDependents.tanksCount > 0 || activeDependents.nozzlesCount > 0) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'PRODUCT_IN_USE',
          message: `Cannot deactivate product while ${activeDependents.tanksCount} tank(s) and ${activeDependents.nozzlesCount} nozzle(s) are actively using it at this outlet.`,
        },
      }, 409);
    }
  }

  const updated = await pumpRepo.updateOutletProductStatus(outletId, productId, status);

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'OUTLET_PRODUCT_STATUS_UPDATE',
    entityType: 'OUTLET_PRODUCT',
    entityId: existing.id,
    oldValue: { status: existing.status },
    newValue: { status },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, data: updated, error: null });
});

// ==========================================
// 2. UNDERGROUND TANKS
// ==========================================

// GET /api/v1/outlets/:outletId/tanks
pumpOperations.get('/outlets/:outletId/tanks', requirePermission(PERMISSIONS.TANKS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const list = await pumpRepo.listTanksByOutlet(outletId);
  return c.json({ success: true, data: list, error: null });
});

// POST /api/v1/outlets/:outletId/tanks
pumpOperations.post('/outlets/:outletId/tanks', requirePermission(PERMISSIONS.TANKS_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid tank payload', details: parseResult.error.flatten() } }, 400);
  }

  const payload = parseResult.data;

  // Rule 1: load Product Master record and enforce liquid tank unit (LITRE only)
  const prodMaster = await pumpRepo.findProductById(payload.productId);
  if (!prodMaster) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Product not found in global catalog' } }, 404);
  }
  if (prodMaster.unit !== 'LITRE') {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'UNIT_NOT_SUPPORTED_BY_LIQUID_TANK',
        message: 'This product is measured in KG and cannot be assigned to a liquid underground tank. CNG source/storage infrastructure is handled separately.',
      },
    }, 400);
  }

  // Rule 2: product must be mapped to the same outlet and ACTIVE
  const outletProduct = await pumpRepo.findOutletProduct(outletId, payload.productId);
  if (!outletProduct || outletProduct.status !== 'ACTIVE') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_PRODUCT', message: 'Product must be mapped and ACTIVE for this retail outlet before assigning to a tank' },
    }, 400);
  }

  // Rule 3: tank_number must be unique per outlet
  const existingTankNum = await pumpRepo.findTankByOutletAndNumber(outletId, payload.tankNumber);
  if (existingTankNum) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'CONFLICT', message: `Tank #${payload.tankNumber} already exists at this outlet` },
    }, 409);
  }

  const nowIso = new Date().toISOString();
  const created = await pumpRepo.createTank({
    id: `tank-${crypto.randomUUID()}`,
    outletId,
    tankNumber: payload.tankNumber,
    name: payload.name,
    productId: payload.productId,
    capacityLitres: payload.capacityLitres,
    safeFillCapacityLitres: payload.safeFillCapacityLitres,
    minimumOperatingLevelLitres: payload.minimumOperatingLevelLitres,
    status: payload.status,
    commissionedAt: payload.commissionedAt || null,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: c.var.user!.user.id,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_CREATE',
    entityType: 'TANK',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// GET /api/v1/tanks/:id
pumpOperations.get('/tanks/:id', requirePermission(PERMISSIONS.TANKS_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const tank = await pumpRepo.findTankById(id);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  return c.json({ success: true, data: tank, error: null });
});

// PUT /api/v1/tanks/:id
pumpOperations.put('/tanks/:id', requirePermission(PERMISSIONS.TANKS_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(id);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() } }, 400);
  }

  const payload = parseResult.data;

  // Validate capacities if provided
  const targetCap = payload.capacityLitres ?? tank.capacityLitres;
  const targetSafe = payload.safeFillCapacityLitres ?? tank.safeFillCapacityLitres;
  if (targetSafe > targetCap) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Safe fill capacity cannot exceed total capacity' } }, 400);
  }

  // Phase 2A Hardening: CNG/KG Protection and product change validation
  if (payload.productId) {
    const prodMaster = await pumpRepo.findProductById(payload.productId);
    if (!prodMaster) {
      return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Product not found in master catalog' } }, 404);
    }
    if (prodMaster.unit !== 'LITRE') {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'UNIT_NOT_SUPPORTED_BY_LIQUID_TANK',
          message: 'This product is measured in KG and cannot be assigned to a liquid underground tank. CNG source/storage infrastructure is handled separately.',
        },
      }, 400);
    }

    if (payload.productId !== tank.productId) {
      const referencingNozzles = await pumpRepo.findNozzlesReferencingTank(id);
      if (referencingNozzles.length > 0) {
        return c.json({
          success: false,
          data: null,
          error: {
            code: 'TANK_IN_USE',
            message: `Cannot change tank product because ${referencingNozzles.length} nozzle(s) currently reference this tank.`,
          },
        }, 409);
      }

      const op = await pumpRepo.findOutletProduct(tank.outletId, payload.productId);
      if (!op || op.status !== 'ACTIVE') {
        return c.json({ success: false, data: null, error: { code: 'INVALID_PRODUCT', message: 'Product must be mapped and ACTIVE for this outlet' } }, 400);
      }
    }
  }

  // Master Status Change Safety: Prevent changing tank status away from ACTIVE if ACTIVE nozzles depend on it
  if (payload.status && payload.status !== 'ACTIVE' && tank.status === 'ACTIVE') {
    const activeNozzles = await pumpRepo.findActiveNozzlesReferencingTank(id);
    if (activeNozzles.length > 0) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'ACTIVE_NOZZLES_DEPEND_ON_TANK',
          message: `Cannot change tank status to ${payload.status} while ${activeNozzles.length} ACTIVE nozzle(s) depend on it. Deactivate or reassign the nozzles first.`,
        },
      }, 409);
    }
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateTank(id, {
    ...payload,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_UPDATE',
    entityType: 'TANK',
    entityId: id,
    oldValue: tank as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updated, error: null });
});

// PATCH /api/v1/tanks/:id/status
pumpOperations.patch('/tanks/:id/status', requirePermission(PERMISSIONS.TANKS_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(id);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const status = body?.status;
  if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'].includes(status)) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid status' } }, 400);
  }

  // Master Status Change Safety: Prevent deactivating tank if ACTIVE nozzles depend on it
  if (status !== 'ACTIVE' && tank.status === 'ACTIVE') {
    const activeNozzles = await pumpRepo.findActiveNozzlesReferencingTank(id);
    if (activeNozzles.length > 0) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'ACTIVE_NOZZLES_DEPEND_ON_TANK',
          message: `Cannot change tank status to ${status} while ${activeNozzles.length} ACTIVE nozzle(s) depend on it. Deactivate or reassign the nozzles first.`,
        },
      }, 409);
    }
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateTank(id, { status, updatedAt: nowIso });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_STATUS_UPDATE',
    entityType: 'TANK',
    entityId: id,
    oldValue: { status: tank.status },
    newValue: { status },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updated, error: null });
});

// ==========================================
// 3. DISPENSERS
// ==========================================

// GET /api/v1/outlets/:outletId/dispensers
pumpOperations.get('/outlets/:outletId/dispensers', requirePermission(PERMISSIONS.DISPENSERS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const list = await pumpRepo.listDispensersByOutlet(outletId);
  return c.json({ success: true, data: list, error: null });
});

// POST /api/v1/outlets/:outletId/dispensers
pumpOperations.post('/outlets/:outletId/dispensers', requirePermission(PERMISSIONS.DISPENSERS_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = DispenserSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() } }, 400);
  }

  const payload = parseResult.data;

  // Rule: dispenser_number must be unique per outlet
  const existingNum = await pumpRepo.findDispenserByOutletAndNumber(outletId, payload.dispenserNumber);
  if (existingNum) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'CONFLICT', message: `Dispenser #${payload.dispenserNumber} already exists at this outlet` },
    }, 409);
  }

  // Rule: serial_number should be unique across all dispensers when provided
  if (payload.serialNumber) {
    const existingSerial = await pumpRepo.findDispenserBySerialNumber(payload.serialNumber);
    if (existingSerial) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'CONFLICT', message: `Dispenser serial number '${payload.serialNumber}' already exists` },
      }, 409);
    }
  }

  const nowIso = new Date().toISOString();
  const created = await pumpRepo.createDispenser({
    id: `disp-${crypto.randomUUID()}`,
    outletId,
    dispenserNumber: payload.dispenserNumber,
    name: payload.name,
    manufacturer: payload.manufacturer || null,
    model: payload.model || null,
    serialNumber: payload.serialNumber || null,
    status: payload.status,
    commissionedAt: payload.commissionedAt || null,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: c.var.user!.user.id,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'DISPENSER_CREATE',
    entityType: 'DISPENSER',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// GET /api/v1/dispensers/:id
pumpOperations.get('/dispensers/:id', requirePermission(PERMISSIONS.DISPENSERS_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const disp = await pumpRepo.findDispenserById(id);
  if (!disp) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Dispenser not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, disp.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this dispenser' } }, 403);
  }

  return c.json({ success: true, data: disp, error: null });
});

// PUT /api/v1/dispensers/:id
pumpOperations.put('/dispensers/:id', requirePermission(PERMISSIONS.DISPENSERS_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const disp = await pumpRepo.findDispenserById(id);
  if (!disp) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Dispenser not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, disp.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this dispenser' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = DispenserUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() } }, 400);
  }

  const payload = parseResult.data;

  // Check serial uniqueness if modified
  if (payload.serialNumber && payload.serialNumber !== disp.serialNumber) {
    const existingSerial = await pumpRepo.findDispenserBySerialNumber(payload.serialNumber);
    if (existingSerial && existingSerial.id !== id) {
      return c.json({ success: false, data: null, error: { code: 'CONFLICT', message: `Serial number '${payload.serialNumber}' already in use` } }, 409);
    }
  }

  // Master Status Change Safety: Prevent deactivating dispenser if ACTIVE nozzles belong to it
  if (payload.status && payload.status !== 'ACTIVE' && disp.status === 'ACTIVE') {
    const activeNozzles = await pumpRepo.findActiveNozzlesByDispenser(id);
    if (activeNozzles.length > 0) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'ACTIVE_NOZZLES_DEPEND_ON_DISPENSER',
          message: `Cannot change dispenser status to ${payload.status} while ${activeNozzles.length} ACTIVE nozzle(s) belong to it. Deactivate the nozzles first.`,
        },
      }, 409);
    }
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateDispenser(id, {
    ...payload,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'DISPENSER_UPDATE',
    entityType: 'DISPENSER',
    entityId: id,
    oldValue: disp as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updated, error: null });
});

// PATCH /api/v1/dispensers/:id/status
pumpOperations.patch('/dispensers/:id/status', requirePermission(PERMISSIONS.DISPENSERS_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const disp = await pumpRepo.findDispenserById(id);
  if (!disp) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Dispenser not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, disp.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this dispenser' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const status = body?.status;
  if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'].includes(status)) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid status' } }, 400);
  }

  // Master Status Change Safety: Prevent deactivating dispenser if ACTIVE nozzles belong to it
  if (status !== 'ACTIVE' && disp.status === 'ACTIVE') {
    const activeNozzles = await pumpRepo.findActiveNozzlesByDispenser(id);
    if (activeNozzles.length > 0) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'ACTIVE_NOZZLES_DEPEND_ON_DISPENSER',
          message: `Cannot change dispenser status to ${status} while ${activeNozzles.length} ACTIVE nozzle(s) belong to it. Deactivate the nozzles first.`,
        },
      }, 409);
    }
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateDispenser(id, { status, updatedAt: nowIso });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'DISPENSER_STATUS_UPDATE',
    entityType: 'DISPENSER',
    entityId: id,
    oldValue: { status: disp.status },
    newValue: { status },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updated, error: null });
});

// ==========================================
// 4. NOZZLES
// ==========================================

// GET /api/v1/dispensers/:dispenserId/nozzles
pumpOperations.get('/dispensers/:dispenserId/nozzles', requirePermission(PERMISSIONS.NOZZLES_READ) as any, async (c: AppContext) => {
  const dispenserId = c.req.param('dispenserId');
  if (!dispenserId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'dispenserId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const disp = await pumpRepo.findDispenserById(dispenserId);
  if (!disp) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Dispenser not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, disp.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this dispenser' } }, 403);
  }

  const list = await pumpRepo.listNozzlesByDispenser(dispenserId);
  return c.json({ success: true, data: list, error: null });
});

// GET /api/v1/outlets/:outletId/nozzles
pumpOperations.get('/outlets/:outletId/nozzles', requirePermission(PERMISSIONS.NOZZLES_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const list = await pumpRepo.listNozzlesByOutlet(outletId);
  return c.json({ success: true, data: list, error: null });
});

// POST /api/v1/dispensers/:dispenserId/nozzles
pumpOperations.post('/dispensers/:dispenserId/nozzles', requirePermission(PERMISSIONS.NOZZLES_WRITE) as any, async (c: AppContext) => {
  const dispenserId = c.req.param('dispenserId');
  if (!dispenserId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'dispenserId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const disp = await pumpRepo.findDispenserById(dispenserId);
  if (!disp) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Dispenser not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, disp.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this dispenser' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = NozzleSchema.safeParse({ ...body, dispenserId });
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid nozzle payload', details: parseResult.error.flatten() } }, 400);
  }

  const payload = parseResult.data;
  const outletId = disp.outletId;
  const targetStatus = payload.status || 'ACTIVE';

  // Rule: nozzle_number must be unique within a dispenser
  const existingNum = await pumpRepo.findNozzleByDispenserAndNumber(dispenserId, payload.nozzleNumber);
  if (existingNum) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'CONFLICT', message: `Nozzle #${payload.nozzleNumber} already exists on this dispenser` },
    }, 409);
  }

  // Rule: Product master must exist
  const prodMaster = await pumpRepo.findProductById(payload.productId);
  if (!prodMaster) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Product not found in global catalog' },
    }, 404);
  }

  // Rule: Product must be mapped to the outlet
  const outletProduct = await pumpRepo.findOutletProduct(outletId, payload.productId);
  if (!outletProduct) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_PRODUCT', message: 'Product must be mapped to this retail outlet' },
    }, 400);
  }

  // Rule: Tank must belong to the same outlet
  const tank = await pumpRepo.findTankById(payload.tankId);
  if (!tank || tank.outletId !== outletId) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_TANK', message: 'Tank does not exist or belongs to another retail outlet' },
    }, 400);
  }

  // Rule: Tank product must match nozzle product
  if (tank.productId !== payload.productId) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'PRODUCT_MISMATCH',
        message: `Tank product does not match nozzle product`,
      },
    }, 400);
  }

  // Rule: When creating an ACTIVE nozzle, all dependencies must be ACTIVE
  if (targetStatus === 'ACTIVE') {
    if (disp.status !== 'ACTIVE') {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INACTIVE_DISPENSER', message: `Cannot create an ACTIVE nozzle on dispenser #${disp.dispenserNumber} because it is ${disp.status}` },
      }, 400);
    }
    if (tank.status !== 'ACTIVE') {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INACTIVE_TANK', message: `Cannot create an ACTIVE nozzle for tank #${tank.tankNumber} because it is ${tank.status}` },
      }, 400);
    }
    if (prodMaster.status !== 'ACTIVE') {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INACTIVE_PRODUCT', message: `Cannot create an ACTIVE nozzle because product '${prodMaster.code}' is ${prodMaster.status}` },
      }, 400);
    }
    if (outletProduct.status !== 'ACTIVE') {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INACTIVE_PRODUCT', message: `Cannot create an ACTIVE nozzle because product mapping is ${outletProduct.status}` },
      }, 400);
    }
  }

  const nowIso = new Date().toISOString();
  const created = await pumpRepo.createNozzle({
    id: `nozz-${crypto.randomUUID()}`,
    outletId,
    dispenserId,
    nozzleNumber: payload.nozzleNumber,
    productId: payload.productId,
    tankId: payload.tankId,
    status: payload.status,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: c.var.user!.user.id,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'NOZZLE_CREATE',
    entityType: 'NOZZLE',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// GET /api/v1/nozzles/:id
pumpOperations.get('/nozzles/:id', requirePermission(PERMISSIONS.NOZZLES_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const nozzle = await pumpRepo.findNozzleById(id);
  if (!nozzle) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Nozzle not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, nozzle.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this nozzle' } }, 403);
  }

  return c.json({ success: true, data: nozzle, error: null });
});

// PUT /api/v1/nozzles/:id
pumpOperations.put('/nozzles/:id', requirePermission(PERMISSIONS.NOZZLES_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const nozzle = await pumpRepo.findNozzleById(id);
  if (!nozzle) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Nozzle not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, nozzle.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this nozzle' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = NozzleUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() } }, 400);
  }

  const payload = parseResult.data;
  const targetTankId = payload.tankId || nozzle.tankId;
  const targetProductId = payload.productId || nozzle.productId;
  const targetStatus = payload.status || nozzle.status;

  const tank = await pumpRepo.findTankById(targetTankId);
  if (!tank || tank.outletId !== nozzle.outletId) {
    return c.json({ success: false, data: null, error: { code: 'INVALID_TANK', message: 'Tank not found or belongs to another outlet' } }, 400);
  }

  if (tank.productId !== targetProductId) {
    return c.json({ success: false, data: null, error: { code: 'PRODUCT_MISMATCH', message: 'Tank product must match nozzle product' } }, 400);
  }

  const prodMaster = await pumpRepo.findProductById(targetProductId);
  if (!prodMaster) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Product not found in global catalog' } }, 404);
  }

  const outletProd = await pumpRepo.findOutletProduct(nozzle.outletId, targetProductId);
  if (!outletProd) {
    return c.json({ success: false, data: null, error: { code: 'INVALID_PRODUCT', message: 'Product is not mapped for this outlet' } }, 400);
  }

  // Active Nozzle Dependency Safety: if target status is ACTIVE, verify all dependencies are ACTIVE
  if (targetStatus === 'ACTIVE') {
    const disp = await pumpRepo.findDispenserById(nozzle.dispenserId);
    if (!disp || disp.status !== 'ACTIVE') {
      return c.json({ success: false, data: null, error: { code: 'INACTIVE_DISPENSER', message: `Cannot set nozzle to ACTIVE because dispenser #${disp?.dispenserNumber} is ${disp?.status}` } }, 400);
    }
    if (tank.status !== 'ACTIVE') {
      return c.json({ success: false, data: null, error: { code: 'INACTIVE_TANK', message: `Cannot set nozzle to ACTIVE because tank #${tank.tankNumber} is ${tank.status}` } }, 400);
    }
    if (prodMaster.status !== 'ACTIVE') {
      return c.json({ success: false, data: null, error: { code: 'INACTIVE_PRODUCT', message: `Cannot set nozzle to ACTIVE because product '${prodMaster.code}' is ${prodMaster.status}` } }, 400);
    }
    if (outletProd.status !== 'ACTIVE') {
      return c.json({ success: false, data: null, error: { code: 'INACTIVE_PRODUCT', message: `Cannot set nozzle to ACTIVE because outlet product mapping is ${outletProd.status}` } }, 400);
    }
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateNozzle(id, {
    ...payload,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'NOZZLE_UPDATE',
    entityType: 'NOZZLE',
    entityId: id,
    oldValue: nozzle as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updated, error: null });
});

// PATCH /api/v1/nozzles/:id/status
pumpOperations.patch('/nozzles/:id/status', requirePermission(PERMISSIONS.NOZZLES_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const nozzle = await pumpRepo.findNozzleById(id);
  if (!nozzle) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Nozzle not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, nozzle.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this nozzle' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const status = body?.status;
  if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'].includes(status)) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid status' } }, 400);
  }

  // Active Nozzle Dependency Safety: if activating, verify all dependencies are ACTIVE
  if (status === 'ACTIVE') {
    const disp = await pumpRepo.findDispenserById(nozzle.dispenserId);
    if (!disp || disp.status !== 'ACTIVE') {
      return c.json({ success: false, data: null, error: { code: 'INACTIVE_DISPENSER', message: `Cannot activate nozzle because dispenser #${disp?.dispenserNumber} is ${disp?.status}` } }, 400);
    }
    const tank = await pumpRepo.findTankById(nozzle.tankId);
    if (!tank || tank.status !== 'ACTIVE') {
      return c.json({ success: false, data: null, error: { code: 'INACTIVE_TANK', message: `Cannot activate nozzle because tank #${tank?.tankNumber} is ${tank?.status}` } }, 400);
    }
    if (tank.outletId !== nozzle.outletId) {
      return c.json({ success: false, data: null, error: { code: 'INVALID_TANK', message: 'Tank belongs to another outlet' } }, 400);
    }
    if (tank.productId !== nozzle.productId) {
      return c.json({ success: false, data: null, error: { code: 'PRODUCT_MISMATCH', message: 'Tank product must match nozzle product' } }, 400);
    }
    const prodMaster = await pumpRepo.findProductById(nozzle.productId);
    if (!prodMaster || prodMaster.status !== 'ACTIVE') {
      return c.json({ success: false, data: null, error: { code: 'INACTIVE_PRODUCT', message: `Cannot activate nozzle because product '${prodMaster?.code}' is ${prodMaster?.status}` } }, 400);
    }
    const outletProd = await pumpRepo.findOutletProduct(nozzle.outletId, nozzle.productId);
    if (!outletProd || outletProd.status !== 'ACTIVE') {
      return c.json({ success: false, data: null, error: { code: 'INACTIVE_PRODUCT', message: `Cannot activate nozzle because outlet product mapping is ${outletProd?.status}` } }, 400);
    }
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateNozzle(id, { status, updatedAt: nowIso });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'NOZZLE_STATUS_UPDATE',
    entityType: 'NOZZLE',
    entityId: id,
    oldValue: { status: nozzle.status },
    newValue: { status },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updated, error: null });
});

// ==========================================
// 5. SHIFT TEMPLATES
// ==========================================

// GET /api/v1/outlets/:outletId/shift-templates
pumpOperations.get('/outlets/:outletId/shift-templates', requirePermission(PERMISSIONS.SHIFT_TEMPLATES_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const list = await pumpRepo.listShiftTemplatesByOutlet(outletId);
  return c.json({ success: true, data: list, error: null });
});

// POST /api/v1/outlets/:outletId/shift-templates
pumpOperations.post('/outlets/:outletId/shift-templates', requirePermission(PERMISSIONS.SHIFT_TEMPLATES_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = ShiftTemplateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() } }, 400);
  }

  const payload = parseResult.data;

  // Check code uniqueness per outlet
  const existing = await pumpRepo.findShiftTemplateByCode(outletId, payload.code);
  if (existing) {
    return c.json({ success: false, data: null, error: { code: 'CONFLICT', message: `Shift template code '${payload.code}' already exists for this outlet` } }, 409);
  }

  const nowIso = new Date().toISOString();
  const created = await pumpRepo.createShiftTemplate({
    id: `st-${crypto.randomUUID()}`,
    outletId,
    code: payload.code,
    name: payload.name,
    startTime: payload.startTime,
    endTime: payload.endTime,
    sequence: payload.sequence,
    status: payload.status,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: c.var.user!.user.id,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'SHIFT_TEMPLATE_CREATE',
    entityType: 'SHIFT_TEMPLATE',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// GET /api/v1/shift-templates/:id
pumpOperations.get('/shift-templates/:id', requirePermission(PERMISSIONS.SHIFT_TEMPLATES_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const tpl = await pumpRepo.findShiftTemplateById(id);
  if (!tpl) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Shift template not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tpl.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift template' } }, 403);
  }

  return c.json({ success: true, data: tpl, error: null });
});

// PUT /api/v1/shift-templates/:id
pumpOperations.put('/shift-templates/:id', requirePermission(PERMISSIONS.SHIFT_TEMPLATES_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tpl = await pumpRepo.findShiftTemplateById(id);
  if (!tpl) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Shift template not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tpl.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift template' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = ShiftTemplateSchema.partial().safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() } }, 400);
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateShiftTemplate(id, {
    ...parseResult.data,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'SHIFT_TEMPLATE_UPDATE',
    entityType: 'SHIFT_TEMPLATE',
    entityId: id,
    oldValue: tpl as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updated, error: null });
});

// PATCH /api/v1/shift-templates/:id/status
pumpOperations.patch('/shift-templates/:id/status', requirePermission(PERMISSIONS.SHIFT_TEMPLATES_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tpl = await pumpRepo.findShiftTemplateById(id);
  if (!tpl) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Shift template not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tpl.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift template' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const status = body?.status;
  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: "status must be 'ACTIVE' or 'INACTIVE'" } }, 400);
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateShiftTemplate(id, { status, updatedAt: nowIso });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'SHIFT_TEMPLATE_STATUS_UPDATE',
    entityType: 'SHIFT_TEMPLATE',
    entityId: id,
    oldValue: { status: tpl.status },
    newValue: { status },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updated, error: null });
});

export default pumpOperations;
