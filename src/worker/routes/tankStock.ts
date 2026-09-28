import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from '../services/scopeService';
import { TankCalibrationService } from '../services/tankCalibrationService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { TankStockReadingSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';
import { parseMilliunits, formatMilliunits } from '../../shared/precision';

export const tankStock = new Hono<{ Bindings: EnvBindings }>();

tankStock.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

// GET /api/v1/shifts/:shiftId/tank-snapshots - List tank snapshots for shift
tankStock.get('/shifts/:shiftId/tank-snapshots', requirePermission(PERMISSIONS.TANK_STOCK_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift outlet' } }, 403);
  }

  const snapshots = await pumpRepo.listShiftTankSnapshots(shiftId);
  return c.json({ success: true, data: snapshots, error: null });
});

// GET /api/v1/shifts/:shiftId/tank-readings - List all tank stock readings for shift
tankStock.get('/shifts/:shiftId/tank-readings', requirePermission(PERMISSIONS.TANK_STOCK_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift outlet' } }, 403);
  }

  const readings = await pumpRepo.listShiftTankReadings(shiftId);
  return c.json({ success: true, data: readings, error: null });
});

// GET /api/v1/shifts/:shiftId/tanks/:tankId/readings - List readings for specific tank
tankStock.get('/shifts/:shiftId/tanks/:tankId/readings', requirePermission(PERMISSIONS.TANK_STOCK_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  const tankId = c.req.param('tankId');
  if (!shiftId || !tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId and tankId are required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift outlet' } }, 403);
  }

  const all = await pumpRepo.listShiftTankReadings(shiftId);
  const filtered = all.filter(r => r.tankId === tankId);
  return c.json({ success: true, data: filtered, error: null });
});

// GET /api/v1/outlets/:outletId/tanks/:tankId/previous-closing - Suggest opening stock from prior closed shift
tankStock.get('/outlets/:outletId/tanks/:tankId/previous-closing', requirePermission(PERMISSIONS.TANK_STOCK_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  const tankId = c.req.param('tankId');
  if (!outletId || !tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId and tankId are required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const prev = await pumpRepo.findPreviousShiftClosingStock(outletId, tankId);
  return c.json({
    success: true,
    data: prev ? {
      suggestedOpeningStockMilliunits: prev.closingStockMilliunits,
      suggestedOpeningStockStr: prev.closingStockStr,
      previousShiftId: prev.shiftId,
      previousBusinessDate: prev.businessDate,
    } : null,
    error: null,
  });
});

// POST /api/v1/shifts/:shiftId/tank-readings - Record physical tank dip reading
tankStock.post('/shifts/:shiftId/tank-readings', requirePermission(PERMISSIONS.TANK_STOCK_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Operational shift not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this shift outlet' } }, 403);
  }

  if (shift.status === 'CLOSED' || shift.status === 'LOCKED') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'SHIFT_CLOSED', message: `Operational shift is ${shift.status}. Modifying tank readings on a closed shift is prohibited.` },
    }, 409);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankStockReadingSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid tank reading payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { tankId, readingType, source, productDipMm, waterDipMm, notes } = parseResult.data;

  // Validate tank belongs to snapshot for this shift
  const tankSnap = await pumpRepo.findShiftTankSnapshot(shiftId, tankId);
  if (!tankSnap) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_TANK', message: 'Tank is not part of the active snapshot for this operational shift' },
    }, 400);
  }

  // Check single OPENING and single CLOSING constraint
  if (readingType === 'OPENING' || readingType === 'CLOSING') {
    const existing = await pumpRepo.findShiftTankReadingByType(shiftId, tankId, readingType);
    if (existing) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'DUPLICATE_READING_TYPE',
          message: `An ${readingType} reading has already been recorded for Tank #${tankSnap.tankNumber} in this shift`,
        },
      }, 409);
    }
  }

  const productDipMilli = parseMilliunits(productDipMm);
  const waterDipMilli = parseMilliunits(waterDipMm || '0.000');

  if (waterDipMilli > productDipMilli) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Water dip cannot exceed product dip' },
    }, 400);
  }

  // Authoritative volume derivation via calibration service
  let grossObservedVolumeMilliunits: number;
  let waterVolumeMilliunits = 0;

  try {
    const grossResult = await TankCalibrationService.convertDipToVolume(db, tankId, productDipMilli);
    grossObservedVolumeMilliunits = grossResult.calculatedVolumeMilliunits;

    if (waterDipMilli > 0) {
      const waterResult = await TankCalibrationService.convertDipToVolume(db, tankId, waterDipMilli);
      waterVolumeMilliunits = waterResult.calculatedVolumeMilliunits;
    }
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'CALIBRATION_ERROR', message: err.message },
    }, 400);
  }

  if (waterVolumeMilliunits > grossObservedVolumeMilliunits) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Derived water volume exceeds gross observed volume' },
    }, 400);
  }

  const netProductVolumeMilliunits = grossObservedVolumeMilliunits - waterVolumeMilliunits;
  if (netProductVolumeMilliunits < 0) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Net product volume cannot be negative' },
    }, 400);
  }

  const nowIso = new Date().toISOString();
  const readingId = `tsr-${crypto.randomUUID()}`;

  const result = await pumpRepo.createTankReadingConditional({
    id: readingId,
    operationalShiftId: shiftId,
    outletId: shift.outletId,
    tankId,
    productId: tankSnap.productId,
    readingType,
    source,
    productDipMmMilliunits: productDipMilli,
    waterDipMmMilliunits: waterDipMilli,
    grossObservedVolumeMilliunits,
    waterVolumeMilliunits,
    netProductVolumeMilliunits,
    recordedAt: nowIso,
    recordedByUserId: c.var.user!.user.id,
    notes: notes || null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  if (!result.success || !result.reading) {
    if (result.shiftClosed) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED. Modifying tank readings on a closed shift is prohibited.' },
      }, 409);
    }
    return c.json({
      success: false,
      data: null,
      error: { code: 'CONFLICT', message: 'Could not record tank stock reading due to a conflicting record' },
    }, 409);
  }

  const created = result.reading;

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_STOCK_READING_RECORD',
    entityType: 'TANK_STOCK_READING',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

export default tankStock;
