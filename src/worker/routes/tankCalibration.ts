import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from '../services/scopeService';
import { TankCalibrationService } from '../services/tankCalibrationService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  TankCalibrationPointSchema,
  TankCalibrationBulkSchema,
} from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';
import { parseMilliunits, formatMilliunits } from '../../shared/precision';

export const tankCalibration = new Hono<{ Bindings: EnvBindings }>();

tankCalibration.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

// GET /api/v1/tanks/:tankId/calibration - List calibration points
tankCalibration.get('/tanks/:tankId/calibration', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const points = await pumpRepo.listCalibrationPoints(tankId);
  return c.json({ success: true, data: points, error: null });
});

// POST /api/v1/tanks/:tankId/calibration - Create a single calibration point
tankCalibration.post('/tanks/:tankId/calibration', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankCalibrationPointSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid calibration point payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { dipMillimetres, volumeLitres } = parseResult.data;
  const dipMilli = parseMilliunits(dipMillimetres);
  const volMilli = parseMilliunits(volumeLitres);

  // Check monotonic consistency with existing points
  const existingPoints = await pumpRepo.listCalibrationPoints(tankId);
  for (const pt of existingPoints) {
    if (pt.dipMillimetresMilliunits === dipMilli) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'DUPLICATE_DIP', message: `Calibration point for dip ${dipMillimetres} mm already exists` },
      }, 409);
    }
    if (pt.dipMillimetresMilliunits < dipMilli && pt.volumeMilliunits > volMilli) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'NON_MONOTONIC_CALIBRATION',
          message: `Volume ${volumeLitres} L at ${dipMillimetres} mm is less than ${pt.volumeLitreStr} L at ${pt.dipMmStr} mm`,
        },
      }, 400);
    }
    if (pt.dipMillimetresMilliunits > dipMilli && pt.volumeMilliunits < volMilli) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'NON_MONOTONIC_CALIBRATION',
          message: `Volume ${volumeLitres} L at ${dipMillimetres} mm is greater than ${pt.volumeLitreStr} L at ${pt.dipMmStr} mm`,
        },
      }, 400);
    }
  }

  const nowIso = new Date().toISOString();
  const pointId = `tcp-${crypto.randomUUID()}`;
  const created = await pumpRepo.createCalibrationPoint({
    id: pointId,
    tankId,
    dipMillimetresMilliunits: dipMilli,
    volumeMilliunits: volMilli,
    createdAt: nowIso,
    createdBy: c.var.user!.user.id,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_CALIBRATION_POINT_CREATE',
    entityType: 'TANK_CALIBRATION',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// PUT /api/v1/tanks/:tankId/calibration/:pointId - Update a calibration point
tankCalibration.put('/tanks/:tankId/calibration/:pointId', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  const pointId = c.req.param('pointId');
  if (!tankId || !pointId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId and pointId are required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const existing = await pumpRepo.findCalibrationPointById(pointId);
  if (!existing || existing.tankId !== tankId) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Calibration point not found' } }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankCalibrationPointSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid calibration point payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { dipMillimetres, volumeLitres } = parseResult.data;
  const dipMilli = parseMilliunits(dipMillimetres);
  const volMilli = parseMilliunits(volumeLitres);

  // Check monotonic consistency with all other points
  const allPoints = await pumpRepo.listCalibrationPoints(tankId);
  for (const pt of allPoints) {
    if (pt.id === pointId) continue;
    if (pt.dipMillimetresMilliunits === dipMilli) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'DUPLICATE_DIP', message: `Calibration point for dip ${dipMillimetres} mm already exists` },
      }, 409);
    }
    if (pt.dipMillimetresMilliunits < dipMilli && pt.volumeMilliunits > volMilli) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'NON_MONOTONIC_CALIBRATION',
          message: `Volume ${volumeLitres} L at ${dipMillimetres} mm is less than ${pt.volumeLitreStr} L at ${pt.dipMmStr} mm`,
        },
      }, 400);
    }
    if (pt.dipMillimetresMilliunits > dipMilli && pt.volumeMilliunits < volMilli) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'NON_MONOTONIC_CALIBRATION',
          message: `Volume ${volumeLitres} L at ${dipMillimetres} mm is greater than ${pt.volumeLitreStr} L at ${pt.dipMmStr} mm`,
        },
      }, 400);
    }
  }

  const updated = await pumpRepo.updateCalibrationPoint(pointId, {
    dipMillimetresMilliunits: dipMilli,
    volumeMilliunits: volMilli,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_CALIBRATION_POINT_UPDATE',
    entityType: 'TANK_CALIBRATION',
    entityId: pointId,
    oldValue: existing as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, data: updated, error: null });
});

// DELETE /api/v1/tanks/:tankId/calibration/:pointId - Delete a calibration point
tankCalibration.delete('/tanks/:tankId/calibration/:pointId', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  const pointId = c.req.param('pointId');
  if (!tankId || !pointId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId and pointId are required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const existing = await pumpRepo.findCalibrationPointById(pointId);
  if (!existing || existing.tankId !== tankId) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Calibration point not found' } }, 404);
  }

  await pumpRepo.deleteCalibrationPoint(pointId);

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'TANK_CALIBRATION_POINT_DELETE',
    entityType: 'TANK_CALIBRATION',
    entityId: pointId,
    oldValue: existing as unknown as Record<string, unknown>,
    newValue: null,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, data: { message: 'Calibration point deleted' }, error: null });
});

// POST /api/v1/tanks/:tankId/calibration/bulk - Bulk import calibration chart
tankCalibration.post('/tanks/:tankId/calibration/bulk', requirePermission(PERMISSIONS.TANK_CALIBRATION_WRITE) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const tank = await pumpRepo.findTankById(tankId);
  if (!tank) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, tank.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this tank outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = TankCalibrationBulkSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid bulk calibration payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const rawPoints = parseResult.data.points;
  const parsedPoints: Array<{ dipMillimetresMilliunits: number; volumeMilliunits: number }> = [];

  for (const pt of rawPoints) {
    parsedPoints.push({
      dipMillimetresMilliunits: parseMilliunits(pt.dipMillimetres),
      volumeMilliunits: parseMilliunits(pt.volumeLitres),
    });
  }

  try {
    const imported = await pumpRepo.bulkImportCalibrationPoints(
      tankId,
      parsedPoints,
      c.var.user!.user.id
    );

    await auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId: c.var.user!.user.id,
      action: 'TANK_CALIBRATION_BULK_IMPORT',
      entityType: 'TANK_CALIBRATION',
      entityId: tankId,
      newValue: { count: imported.length } as Record<string, unknown>,
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
      createdAt: new Date().toISOString(),
    });

    return c.json({ success: true, data: imported, error: null }, 201);
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'CALIBRATION_IMPORT_FAILED', message: err.message },
    }, 400);
  }
});

// POST /api/v1/tanks/:tankId/convert-dip - Dry-run dip-to-volume conversion
tankCalibration.post('/tanks/:tankId/convert-dip', requirePermission(PERMISSIONS.TANK_CALIBRATION_READ) as any, async (c: AppContext) => {
  const tankId = c.req.param('tankId');
  if (!tankId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'tankId is required' } }, 400);

  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const dipMmStr = body?.dipMillimetres;
  if (!dipMmStr) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'dipMillimetres is required' } }, 400);
  }

  try {
    const dipMilli = parseMilliunits(dipMmStr);
    const result = await TankCalibrationService.convertDipToVolume(db, tankId, dipMilli);
    return c.json({ success: true, data: result, error: null });
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: err.code || 'CONVERSION_ERROR', message: err.message },
    }, 400);
  }
});

export default tankCalibration;
