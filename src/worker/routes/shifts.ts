import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  OpenShiftSchema,
  MeterReadingSchema,
  NozzleUnavailabilitySchema,
} from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';
import { parseMilliunits, formatMilliunits } from '../../shared/precision';

export const shifts = new Hono<{ Bindings: EnvBindings }>();

shifts.use('*', requireAuth as any);

// Scope authority helper
async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

// ==========================================
// 1. OPERATIONAL SHIFTS MANAGEMENT
// ==========================================

// GET /api/v1/outlets/:outletId/shifts - List shifts for outlet
shifts.get('/outlets/:outletId/shifts', requirePermission(PERMISSIONS.SHIFTS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const list = await pumpRepo.listOperationalShiftsByOutlet(outletId);
  return c.json({ success: true, data: list, error: null });
});

// POST /api/v1/outlets/:outletId/shifts/open - Open a new operational shift
shifts.post('/outlets/:outletId/shifts/open', requirePermission(PERMISSIONS.SHIFTS_OPEN) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  // Phase 2B: Enforce at most ONE active operational shift (OPEN or CLOSING) for an outlet
  const activeShift = await pumpRepo.findActiveOperationalShift(outletId);
  if (activeShift) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'OPEN_SHIFT_EXISTS',
        message: `An active operational shift is already ${activeShift.status} for this outlet (Shift ID: ${activeShift.id}, Date: ${activeShift.businessDate}). Close the prior shift before opening a new one.`,
      },
    }, 409);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = OpenShiftSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid shift payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { shiftTemplateId, businessDate, notes } = parseResult.data;

  // Validate shift template exists and belongs to this outlet
  const template = await pumpRepo.findShiftTemplateById(shiftTemplateId);
  if (!template || template.outletId !== outletId) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_TEMPLATE', message: 'Shift template does not exist or belongs to another outlet' },
    }, 400);
  }

  if (template.status !== 'ACTIVE') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INACTIVE_TEMPLATE', message: 'Shift template is inactive' },
    }, 400);
  }

  // Unique protection: Prevent duplicate operational shifts for the same outlet + shift template + business date
  const existingShift = await pumpRepo.findExistingShift(outletId, shiftTemplateId, businessDate);
  if (existingShift) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'CONFLICT',
        message: `An operational shift already exists for this outlet, template (${template.name}), and business date (${businessDate})`,
      },
    }, 409);
  }

  const nowIso = new Date().toISOString();
  const shiftId = `ops-${crypto.randomUUID()}`;

  // Open shift and capture snapshot atomically
  const openRes = await pumpRepo.openOperationalShiftWithSnapshot({
    id: shiftId,
    outletId,
    shiftTemplateId,
    businessDate,
    startedAt: nowIso,
    openedByUserId: c.var.user!.user.id,
    notes: notes || null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  if (!openRes.success || !openRes.shift) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: openRes.error || 'NO_OPERATIONAL_NOZZLES',
        message: openRes.message || 'Cannot open operational shift: No active nozzles with valid active dependencies exist for this outlet.',
      },
    }, 409);
  }

  const { shift: opened, snapshotsCount } = openRes;

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'SHIFT_OPEN',
    entityType: 'OPERATIONAL_SHIFT',
    entityId: opened.id,
    newValue: { ...opened, snapshotsCount } as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: opened, error: null }, 201);
});

// GET /api/v1/shifts/:shiftId - Get operational shift details
shifts.get('/shifts/:shiftId', requirePermission(PERMISSIONS.SHIFTS_READ) as any, async (c: AppContext) => {
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

  return c.json({ success: true, data: shift, error: null });
});

// POST /api/v1/shifts/:shiftId/close - Transactionally close operational shift with completeness validation
shifts.post('/shifts/:shiftId/close', requirePermission(PERMISSIONS.SHIFTS_CLOSE) as any, async (c: AppContext) => {
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
      error: { code: 'SHIFT_CLOSED', message: `Operational shift is already ${shift.status}` },
    }, 409);
  }

  // 1. Tank Stock & Receipts Completeness Check
  const tankCheck = await pumpRepo.validateShiftCompleteness(shiftId);
  if (!tankCheck.valid) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: tankCheck.error || 'INCOMPLETE_TANK_STOCK_DATA',
        message: tankCheck.message || 'Tank stock data is incomplete',
        details: tankCheck.details || null,
      },
    }, 400);
  }

  // 2. Nozzle Meter Readings Completeness Check
  const snapshots = await pumpRepo.listShiftNozzleSnapshots(shiftId);
  const readings = await pumpRepo.listReadingsForShift(shiftId);
  const unavails = await pumpRepo.listUnavailabilityForShift(shiftId);

  const coveredNozzleIds = new Set<string>();
  readings.forEach(r => coveredNozzleIds.add(r.nozzleId));
  unavails.forEach(u => coveredNozzleIds.add(u.nozzleId));

  const missingSnapshots = snapshots.filter(s => !coveredNozzleIds.has(s.nozzleId));

  if (missingSnapshots.length > 0) {
    const missingDescriptions = missingSnapshots.map(
      s => `Dispenser #${s.dispenserNumber} - Nozzle #${s.nozzleNumber} (${s.productName || s.productCode})`
    );

    return c.json({
      success: false,
      data: null,
      error: {
        code: 'INCOMPLETE_SHIFT_READINGS',
        message: `Cannot close shift. ${missingSnapshots.length} active nozzle(s) have neither a meter reading nor an approved unavailability record.`,
        details: {
          missingCount: missingSnapshots.length,
          missingNozzles: missingDescriptions,
        },
      },
    }, 400);
  }

  // Concurrent immutability safe conditional close
  const closeRes = await pumpRepo.closeOperationalShiftConditional(shiftId, c.var.user!.user.id);
  if (!closeRes.success) {
    if (closeRes.alreadyClosed) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'SHIFT_CLOSED', message: 'Operational shift was closed concurrently.' },
      }, 409);
    }
    const statusCode = (closeRes.error === 'INCOMPLETE_TANK_STOCK_DATA' || closeRes.error === 'INCOMPLETE_RECEIPTS') ? 400 : 404;
    return c.json({
      success: false,
      data: null,
      error: { code: closeRes.error || 'NOT_FOUND', message: closeRes.message || 'Operational shift not found or invalid' },
    }, statusCode as any);
  }

  const closed = closeRes.shift!;

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'SHIFT_CLOSE',
    entityType: 'OPERATIONAL_SHIFT',
    entityId: shiftId,
    oldValue: { status: shift.status },
    newValue: closed as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, data: closed, error: null });
});

// GET /api/v1/shifts/:shiftId/entry-grid - Shift entry workspace helper
shifts.get('/shifts/:shiftId/entry-grid', requirePermission(PERMISSIONS.SHIFTS_READ) as any, async (c: AppContext) => {
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

  const grid = await pumpRepo.getShiftEntryGrid(shiftId);
  return c.json({ success: true, data: grid, error: null });
});

// ==========================================
// 2. NOZZLE METER READINGS (EXACT 3-DECIMAL SCALED INTEGER PRECISION)
// ==========================================

// GET /api/v1/shifts/:shiftId/readings - List readings for shift
shifts.get('/shifts/:shiftId/readings', requirePermission(PERMISSIONS.METER_READINGS_READ) as any, async (c: AppContext) => {
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

  const readings = await pumpRepo.listReadingsForShift(shiftId);
  return c.json({ success: true, data: readings, error: null });
});

// POST /api/v1/shifts/:shiftId/readings - Record or update meter reading
shifts.post('/shifts/:shiftId/readings', requirePermission(PERMISSIONS.METER_READINGS_WRITE) as any, async (c: AppContext) => {
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

  // Immutability: Prohibit modifications to closed/locked shifts
  if (shift.status === 'CLOSED' || shift.status === 'LOCKED') {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'SHIFT_CLOSED',
        message: `Operational shift is ${shift.status}. Modifying meter readings on a closed or locked shift is prohibited.`,
      },
    }, 409);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = MeterReadingSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid reading payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { nozzleId, openingTotalizer, closingTotalizer, testingQuantity, varianceReason } = parseResult.data;

  // Validate nozzle exists in the snapshot for this shift
  const snapshot = await pumpRepo.findShiftNozzleSnapshot(shiftId, nozzleId);
  if (!snapshot) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_NOZZLE', message: 'Nozzle was not part of the active snapshot for this operational shift' },
    }, 400);
  }

  // Exact 3-decimal integer milliunits arithmetic
  let openingMilli: number;
  let closingMilli: number;
  let testingMilli: number;

  try {
    openingMilli = parseMilliunits(openingTotalizer);
    closingMilli = parseMilliunits(closingTotalizer);
    testingMilli = parseMilliunits(testingQuantity || '0.000');
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: err.message },
    }, 400);
  }

  if (closingMilli < openingMilli) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Closing totalizer must be greater than or equal to opening totalizer' },
    }, 400);
  }

  const grossMilli = closingMilli - openingMilli;
  if (testingMilli > grossMilli) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Testing quantity (${formatMilliunits(testingMilli)}) cannot exceed gross sales quantity (${formatMilliunits(grossMilli)})`,
      },
    }, 400);
  }

  const netMilli = grossMilli - testingMilli;

  // Continuity check:
  // Find the most recent CLOSED previous shift reading for this nozzle.
  const latestPrev = await pumpRepo.getLatestClosedReadingForNozzle(nozzleId);
  let hasOpeningVariance = false;
  let openingVarianceMilliunits = 0;
  let finalVarianceReason: string | null = null;

  if (latestPrev && latestPrev.closingTotalizerMilliunits !== undefined) {
    const prevClosingMilli = latestPrev.closingTotalizerMilliunits;
    if (openingMilli !== prevClosingMilli) {
      if (!varianceReason || varianceReason.trim().length === 0) {
        return c.json({
          success: false,
          data: null,
          error: {
            code: 'VARIANCE_REASON_REQUIRED',
            message: `Opening totalizer (${formatMilliunits(openingMilli)}) differs from previous shift closing totalizer (${formatMilliunits(prevClosingMilli)}). A variance_reason is required.`,
            details: {
              enteredOpening: formatMilliunits(openingMilli),
              previousClosing: formatMilliunits(prevClosingMilli),
              varianceQuantity: formatMilliunits(openingMilli - prevClosingMilli),
            },
          },
        }, 400);
      }

      hasOpeningVariance = true;
      openingVarianceMilliunits = openingMilli - prevClosingMilli;
      finalVarianceReason = varianceReason.trim();
    }
  }

  const nowIso = new Date().toISOString();
  const existingReading = await pumpRepo.findReadingByShiftAndNozzle(shiftId, nozzleId);

  let resultReading;
  if (existingReading) {
    const res = await pumpRepo.updateReading(shiftId, nozzleId, {
      openingMilliunits: openingMilli,
      closingMilliunits: closingMilli,
      testingMilliunits: testingMilli,
      grossMilliunits: grossMilli,
      netMilliunits: netMilli,
      hasOpeningVariance,
      openingVarianceMilliunits,
      varianceReason: finalVarianceReason,
      updatedAt: nowIso,
    });
    if (res.shiftClosed) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED. Modifying meter readings on a closed shift is prohibited.' },
      }, 409);
    }
    resultReading = res.reading;
  } else {
    const res = await pumpRepo.createReading({
      id: `nmr-${crypto.randomUUID()}`,
      operationalShiftId: shiftId,
      outletId: shift.outletId,
      nozzleId,
      openingMilliunits: openingMilli,
      closingMilliunits: closingMilli,
      testingMilliunits: testingMilli,
      grossMilliunits: grossMilli,
      netMilliunits: netMilli,
      recordedByUserId: c.var.user!.user.id,
      hasOpeningVariance,
      openingVarianceMilliunits,
      varianceReason: finalVarianceReason,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    if (res.shiftClosed) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED. Modifying meter readings on a closed shift is prohibited.' },
      }, 409);
    }
    resultReading = res.reading;
  }

  // Remove any unavailability record for this nozzle
  await pumpRepo.removeUnavailability(shiftId, nozzleId);

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: existingReading ? 'METER_READING_UPDATE' : 'METER_READING_RECORD',
    entityType: 'NOZZLE_METER_READING',
    entityId: resultReading!.id,
    newValue: resultReading as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: resultReading, error: null }, existingReading ? 200 : 201);
});

// ==========================================
// 3. NOZZLE UNAVAILABILITY RECORDS
// ==========================================

// GET /api/v1/shifts/:shiftId/nozzle-unavailability
shifts.get('/shifts/:shiftId/nozzle-unavailability', requirePermission(PERMISSIONS.METER_READINGS_READ) as any, async (c: AppContext) => {
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

  const list = await pumpRepo.listUnavailabilityForShift(shiftId);
  return c.json({ success: true, data: list, error: null });
});

// POST /api/v1/shifts/:shiftId/nozzle-unavailability
shifts.post('/shifts/:shiftId/nozzle-unavailability', requirePermission(PERMISSIONS.METER_READINGS_WRITE) as any, async (c: AppContext) => {
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

  // Immutability: Prohibit modifications to closed/locked shifts
  if (shift.status === 'CLOSED' || shift.status === 'LOCKED') {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'SHIFT_CLOSED',
        message: `Operational shift is ${shift.status}. Modifying nozzle unavailability on a closed or locked shift is prohibited.`,
      },
    }, 409);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = NozzleUnavailabilitySchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { nozzleId, reason } = parseResult.data;

  // Validate nozzle exists in snapshot for this shift
  const snap = await pumpRepo.findShiftNozzleSnapshot(shiftId, nozzleId);
  if (!snap) {
    return c.json({ success: false, data: null, error: { code: 'INVALID_NOZZLE', message: 'Nozzle was not found in shift snapshot' } }, 400);
  }

  const nowIso = new Date().toISOString();
  const res = await pumpRepo.recordUnavailability({
    id: `nur-${crypto.randomUUID()}`,
    operationalShiftId: shiftId,
    nozzleId,
    reason,
    recordedBy: c.var.user!.user.id,
    createdAt: nowIso,
  });

  if (res.shiftClosed) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED. Modifying nozzle unavailability on a closed shift is prohibited.' },
    }, 409);
  }

  const created = res.record!;

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'NOZZLE_UNAVAILABILITY_RECORD',
    entityType: 'NOZZLE_UNAVAILABILITY',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// DELETE /api/v1/shifts/:shiftId/nozzle-unavailability/:nozzleId
shifts.delete('/shifts/:shiftId/nozzle-unavailability/:nozzleId', requirePermission(PERMISSIONS.METER_READINGS_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  const nozzleId = c.req.param('nozzleId');
  if (!shiftId || !nozzleId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId and nozzleId are required' } }, 400);

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
      error: {
        code: 'SHIFT_CLOSED',
        message: `Operational shift is ${shift.status}. Modifying nozzle unavailability on a closed or locked shift is prohibited.`,
      },
    }, 409);
  }

  const res = await pumpRepo.removeUnavailability(shiftId, nozzleId);
  if (res.shiftClosed) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED. Modifying nozzle unavailability on a closed shift is prohibited.' },
    }, 409);
  }

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'NOZZLE_UNAVAILABILITY_DELETE',
    entityType: 'NOZZLE_UNAVAILABILITY',
    entityId: `${shiftId}:${nozzleId}`,
    oldValue: null,
    newValue: null,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, data: { message: 'Unavailability record removed' }, error: null });
});

// ==========================================
// 4. AUTHORITATIVE SALES SUMMARY
// ==========================================

// GET /api/v1/shifts/:shiftId/sales-summary - Authoritative backend generated shift summary
shifts.get('/shifts/:shiftId/sales-summary', requirePermission(PERMISSIONS.METER_READINGS_READ) as any, async (c: AppContext) => {
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

  const summary = await pumpRepo.getSalesSummary(shiftId);
  return c.json({ success: true, data: summary, error: null });
});

export default shifts;
