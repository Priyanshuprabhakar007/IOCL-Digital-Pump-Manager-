import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository, calcGrossQuantity, calcNetQuantity, round3 } from '../repositories/pumpRepository';
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
shifts.post('/outlets/:outletId/shifts/open', requirePermission(PERMISSIONS.SHIFTS_MANAGE) as any, async (c: AppContext) => {
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
  const opened = await pumpRepo.openOperationalShift({
    id: `ops-${crypto.randomUUID()}`,
    outletId,
    shiftTemplateId,
    businessDate,
    startedAt: nowIso,
    openedByUserId: c.var.user!.user.id,
    notes: notes || null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'SHIFT_OPEN',
    entityType: 'OPERATIONAL_SHIFT',
    entityId: opened.id,
    newValue: opened as unknown as Record<string, unknown>,
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
shifts.post('/shifts/:shiftId/close', requirePermission(PERMISSIONS.SHIFTS_MANAGE) as any, async (c: AppContext) => {
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

  // Completeness Validation:
  // Verify every ACTIVE nozzle assigned to the outlet has a valid meter reading,
  // unless explicitly marked unavailable through an approved reason.
  const activeNozzles = await pumpRepo.listActiveNozzlesForOutlet(shift.outletId);
  const readings = await pumpRepo.listReadingsForShift(shiftId);
  const unavails = await pumpRepo.listUnavailabilityForShift(shiftId);

  const coveredNozzleIds = new Set<string>();
  readings.forEach(r => coveredNozzleIds.add(r.nozzleId));
  unavails.forEach(u => coveredNozzleIds.add(u.nozzleId));

  const missingNozzles = activeNozzles.filter(n => !coveredNozzleIds.has(n.id));

  if (missingNozzles.length > 0) {
    const missingDescriptions = missingNozzles.map(
      n => `Dispenser #${n.dispenserNumber} - Nozzle #${n.nozzleNumber} (${n.productName || n.productCode})`
    );

    return c.json({
      success: false,
      data: null,
      error: {
        code: 'INCOMPLETE_SHIFT_READINGS',
        message: `Cannot close shift. ${missingNozzles.length} active nozzle(s) have neither a meter reading nor an approved unavailability record.`,
        details: {
          missingCount: missingNozzles.length,
          missingNozzles: missingDescriptions,
        },
      },
    }, 400);
  }

  const closed = await pumpRepo.closeOperationalShift(shiftId, c.var.user!.user.id);

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
// 2. NOZZLE METER READINGS
// ==========================================

// GET /api/v1/shifts/:shiftId/readings - List readings for shift
shifts.get('/shifts/:shiftId/readings', requirePermission(PERMISSIONS.READINGS_READ) as any, async (c: AppContext) => {
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

// POST /api/v1/shifts/:shiftId/readings - Record meter reading
shifts.post('/shifts/:shiftId/readings', requirePermission(PERMISSIONS.READINGS_WRITE) as any, async (c: AppContext) => {
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

  // Validate nozzle exists, belongs to operational shift's outlet, is ACTIVE, and dispenser is ACTIVE
  const nozzle = await pumpRepo.findNozzleById(nozzleId);
  if (!nozzle || nozzle.outletId !== shift.outletId) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_NOZZLE', message: 'Nozzle does not exist or does not belong to this outlet' },
    }, 400);
  }

  if (nozzle.status !== 'ACTIVE') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INACTIVE_NOZZLE', message: `Nozzle #${nozzle.nozzleNumber} is ${nozzle.status}, not ACTIVE` },
    }, 400);
  }

  const dispenser = await pumpRepo.findDispenserById(nozzle.dispenserId);
  if (!dispenser || dispenser.status !== 'ACTIVE') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INACTIVE_DISPENSER', message: `Dispenser #${dispenser?.dispenserNumber} is not ACTIVE` },
    }, 400);
  }

  // Prevent duplicate reading row for operational_shift_id + nozzle_id
  const existingReading = await pumpRepo.findReadingByShiftAndNozzle(shiftId, nozzleId);
  if (existingReading) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'CONFLICT', message: 'A meter reading already exists for this nozzle in this shift' },
    }, 409);
  }

  // Business formula calculations
  const grossSales = calcGrossQuantity(closingTotalizer, openingTotalizer);
  if (testingQuantity > grossSales) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Testing quantity (${testingQuantity}) cannot exceed gross sales quantity (${grossSales})`,
      },
    }, 400);
  }
  const netSales = calcNetQuantity(grossSales, testingQuantity);

  // Continuity check:
  // Find the most recent CLOSED previous shift reading for this nozzle.
  const latestPrev = await pumpRepo.getLatestClosedReadingForNozzle(nozzleId);
  let hasOpeningVariance = false;
  let openingVarianceQuantity = 0;
  let finalVarianceReason: string | null = null;

  if (latestPrev) {
    const diff = round3(openingTotalizer - latestPrev.closingTotalizer);
    if (Math.abs(diff) > 0.0001) {
      if (!varianceReason || varianceReason.trim().length === 0) {
        return c.json({
          success: false,
          data: null,
          error: {
            code: 'VARIANCE_REASON_REQUIRED',
            message: `Opening totalizer (${openingTotalizer}) differs from previous shift closing totalizer (${latestPrev.closingTotalizer}) by ${diff}. A variance_reason is required.`,
            details: {
              enteredOpening: openingTotalizer,
              previousClosing: latestPrev.closingTotalizer,
              varianceQuantity: diff,
            },
          },
        }, 400);
      }

      hasOpeningVariance = true;
      openingVarianceQuantity = diff;
      finalVarianceReason = varianceReason.trim();
    }
  }

  const nowIso = new Date().toISOString();
  const created = await pumpRepo.createReading({
    id: `nmr-${crypto.randomUUID()}`,
    operationalShiftId: shiftId,
    outletId: shift.outletId,
    nozzleId,
    openingTotalizer: round3(openingTotalizer),
    closingTotalizer: round3(closingTotalizer),
    testingQuantity: round3(testingQuantity),
    grossSalesQuantity: grossSales,
    netSalesQuantity: netSales,
    recordedByUserId: c.var.user!.user.id,
    hasOpeningVariance,
    openingVarianceQuantity,
    varianceReason: finalVarianceReason,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  // If there was an unavailability record for this nozzle, remove it
  await pumpRepo.removeUnavailability(shiftId, nozzleId);

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'METER_READING_RECORD',
    entityType: 'NOZZLE_METER_READING',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// PUT /api/v1/shifts/:shiftId/readings/:readingId - Update meter reading
shifts.put('/shifts/:shiftId/readings/:readingId', requirePermission(PERMISSIONS.READINGS_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  const readingId = c.req.param('readingId');
  if (!shiftId || !readingId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'shiftId and readingId are required' } }, 400);

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

  const existing = await pumpRepo.findReadingById(readingId);
  if (!existing || existing.operationalShiftId !== shiftId) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Meter reading not found' } }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = MeterReadingSchema.safeParse({ ...body, nozzleId: existing.nozzleId });
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid reading payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { openingTotalizer, closingTotalizer, testingQuantity, varianceReason } = parseResult.data;

  const grossSales = calcGrossQuantity(closingTotalizer, openingTotalizer);
  if (testingQuantity > grossSales) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Testing quantity (${testingQuantity}) cannot exceed gross sales quantity (${grossSales})`,
      },
    }, 400);
  }
  const netSales = calcNetQuantity(grossSales, testingQuantity);

  const latestPrev = await pumpRepo.getLatestClosedReadingForNozzle(existing.nozzleId);
  let hasOpeningVariance = false;
  let openingVarianceQuantity = 0;
  let finalVarianceReason: string | null = null;

  if (latestPrev) {
    const diff = round3(openingTotalizer - latestPrev.closingTotalizer);
    if (Math.abs(diff) > 0.0001) {
      if (!varianceReason || varianceReason.trim().length === 0) {
        return c.json({
          success: false,
          data: null,
          error: {
            code: 'VARIANCE_REASON_REQUIRED',
            message: `Opening totalizer (${openingTotalizer}) differs from previous shift closing totalizer (${latestPrev.closingTotalizer}) by ${diff}. A variance_reason is required.`,
          },
        }, 400);
      }
      hasOpeningVariance = true;
      openingVarianceQuantity = diff;
      finalVarianceReason = varianceReason.trim();
    }
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateReading(readingId, {
    openingTotalizer: round3(openingTotalizer),
    closingTotalizer: round3(closingTotalizer),
    testingQuantity: round3(testingQuantity),
    grossSalesQuantity: grossSales,
    netSalesQuantity: netSales,
    hasOpeningVariance,
    openingVarianceQuantity,
    varianceReason: finalVarianceReason,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'METER_READING_UPDATE',
    entityType: 'NOZZLE_METER_READING',
    entityId: readingId,
    oldValue: existing as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updated, error: null });
});

// ==========================================
// 3. NOZZLE UNAVAILABILITY RECORDS
// ==========================================

// GET /api/v1/shifts/:shiftId/nozzle-unavailability
shifts.get('/shifts/:shiftId/nozzle-unavailability', requirePermission(PERMISSIONS.READINGS_READ) as any, async (c: AppContext) => {
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
shifts.post('/shifts/:shiftId/nozzle-unavailability', requirePermission(PERMISSIONS.READINGS_WRITE) as any, async (c: AppContext) => {
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

  // Validate nozzle belongs to outlet
  const nozzle = await pumpRepo.findNozzleById(nozzleId);
  if (!nozzle || nozzle.outletId !== shift.outletId) {
    return c.json({ success: false, data: null, error: { code: 'INVALID_NOZZLE', message: 'Nozzle not found at this outlet' } }, 400);
  }

  const nowIso = new Date().toISOString();
  const created = await pumpRepo.recordUnavailability({
    id: `nur-${crypto.randomUUID()}`,
    operationalShiftId: shiftId,
    nozzleId,
    reason,
    recordedBy: c.var.user!.user.id,
    createdAt: nowIso,
  });

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
shifts.delete('/shifts/:shiftId/nozzle-unavailability/:nozzleId', requirePermission(PERMISSIONS.READINGS_WRITE) as any, async (c: AppContext) => {
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

  await pumpRepo.removeUnavailability(shiftId, nozzleId);

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
shifts.get('/shifts/:shiftId/sales-summary', requirePermission(PERMISSIONS.READINGS_READ) as any, async (c: AppContext) => {
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
