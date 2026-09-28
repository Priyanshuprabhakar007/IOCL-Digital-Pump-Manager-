import { Hono } from 'hono';
import { eq, and, ne } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from '../services/scopeService';
import { QualityToleranceService } from '../services/qualityToleranceService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  FuelReceiptCreateSchema,
  FuelReceiptStatusUpdateSchema,
  FuelReceiptLineUpdateSchema,
} from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';
import { parseMilliunits, formatMilliunits } from '../../shared/precision';
import { QualityStatus, FuelReceiptStatus } from '../../shared/types';

export const fuelReceipts = new Hono<{ Bindings: EnvBindings }>();

fuelReceipts.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

// GET /api/v1/shifts/:shiftId/fuel-receipts - List fuel receipts for shift
fuelReceipts.get('/shifts/:shiftId/fuel-receipts', requirePermission(PERMISSIONS.FUEL_RECEIPTS_READ) as any, async (c: AppContext) => {
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

  const list = await pumpRepo.listFuelReceiptsByShift(shiftId);
  return c.json({ success: true, data: list, error: null });
});

// POST /api/v1/shifts/:shiftId/fuel-receipts - Create new fuel receipt with tanker lines
fuelReceipts.post('/shifts/:shiftId/fuel-receipts', requirePermission(PERMISSIONS.FUEL_RECEIPTS_WRITE) as any, async (c: AppContext) => {
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
      error: { code: 'SHIFT_CLOSED', message: `Operational shift is ${shift.status}. Recording fuel receipts on a closed shift is prohibited.` },
    }, 409);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = FuelReceiptCreateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid fuel receipt payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { ttNumber, invoiceNumber, invoiceDate, arrivalAt, sealVerified, sealExceptionReason, lines } = parseResult.data;

  // Validate that each receiving tank belongs to this outlet and snapshot
  const shiftTanks = await pumpRepo.listShiftTankSnapshots(shiftId);
  const nowIso = new Date().toISOString();
  const receiptId = `fr-${crypto.randomUUID()}`;

  const preparedLines = [];

  for (const line of lines) {
    const matchedTank = shiftTanks.find(t => t.tankId === line.tankId);
    if (!matchedTank) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INVALID_TANK', message: `Tank ID ${line.tankId} is not part of this active operational shift snapshot` },
      }, 400);
    }
    if (matchedTank.productId !== line.productId) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'PRODUCT_MISMATCH', message: `Tank product does not match receipt line product for Tank #${matchedTank.tankNumber}` },
      }, 400);
    }

    const invQtyMilli = parseMilliunits(line.invoiceQuantity);
    const densityMilli = line.density ? parseMilliunits(line.density) : null;
    const tempMilli = line.temperature ? parseMilliunits(line.temperature) : null;
    const invDensityMilli = line.invoiceDensity ? parseMilliunits(line.invoiceDensity) : null;

    let qualityStatus: QualityStatus = 'NOT_EVALUATED';
    let densityVarianceMilli: number | null = null;

    if (densityMilli != null && invDensityMilli != null) {
      const qRes = await QualityToleranceService.evaluateDensityQuality(
        db,
        shift.outletId,
        line.productId,
        densityMilli,
        invDensityMilli
      );
      qualityStatus = qRes.qualityStatus;
      densityVarianceMilli = qRes.densityVarianceMilliunits;
    }

    preparedLines.push({
      id: `frtl-${crypto.randomUUID()}`,
      fuelReceiptId: receiptId,
      tankId: line.tankId,
      productId: line.productId,
      invoiceQuantityMilliunits: invQtyMilli,
      densityMilliunits: densityMilli,
      temperatureMilliunits: tempMilli,
      invoiceDensityMilliunits: invDensityMilli,
      densityVarianceMilliunits: densityVarianceMilli,
      qualityStatus,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  const result = await pumpRepo.createFuelReceiptConditional(
    {
      id: receiptId,
      outletId: shift.outletId,
      operationalShiftId: shiftId,
      ttNumber,
      invoiceNumber,
      invoiceDate,
      arrivalAt,
      sealVerified: sealVerified ?? true,
      sealExceptionReason: sealExceptionReason || null,
      recordedByUserId: c.var.user!.user.id,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    preparedLines
  );

  if (!result.success || !result.receipt) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED. Recording fuel receipts on a closed shift is prohibited.' },
    }, 409);
  }

  const created = result.receipt;

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'FUEL_RECEIPT_CREATE',
    entityType: 'FUEL_RECEIPT',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: created, error: null }, 201);
});

// GET /api/v1/fuel-receipts/:id - Get receipt by ID
fuelReceipts.get('/fuel-receipts/:id', requirePermission(PERMISSIONS.FUEL_RECEIPTS_READ) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);

  const receipt = await pumpRepo.findFuelReceiptById(id);
  if (!receipt) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Fuel receipt not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, receipt.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this receipt outlet' } }, 403);
  }

  return c.json({ success: true, data: receipt, error: null });
});

// PATCH /api/v1/fuel-receipts/:id/status - Update receipt status & decantation timestamps
fuelReceipts.patch('/fuel-receipts/:id/status', requirePermission(PERMISSIONS.FUEL_RECEIPTS_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const receipt = await pumpRepo.findFuelReceiptById(id);
  if (!receipt) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Fuel receipt not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, receipt.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this receipt outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = FuelReceiptStatusUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid status payload', details: parseResult.error.flatten() },
    }, 400);
  }

  const { status, decantationStartedAt, decantationCompletedAt, sealVerified, sealExceptionReason } = parseResult.data;

  // Validation before status update: check state machine transitions
  if (receipt.status === 'COMPLETED' || receipt.status === 'CANCELLED') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'RECEIPT_FINALIZED', message: `Fuel receipt is ${receipt.status} and cannot be modified.` },
    }, 409);
  }

  const allowedTransitions: Record<string, string[]> = {
    ARRIVED: ['VERIFIED', 'CANCELLED'],
    VERIFIED: ['DECANTED', 'CANCELLED'],
    DECANTED: ['COMPLETED', 'CANCELLED'],
  };

  if (status && !allowedTransitions[receipt.status]?.includes(status)) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_STATUS_TRANSITION', message: `Cannot transition fuel receipt status from ${receipt.status} to ${status}` },
    }, 409);
  }

  const nowIso = new Date().toISOString();
  let decStart = decantationStartedAt || receipt.decantationStartedAt;
  let decComp = decantationCompletedAt || receipt.decantationCompletedAt;

  if (status === 'DECANTED' && !decStart) {
    decStart = nowIso;
  }
  if (status === 'COMPLETED') {
    if (!decComp) decComp = nowIso;
    if (decStart && decComp && decComp < decStart) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INVALID_DECANTATION_TIMESTAMPS', message: 'decantationCompletedAt must be on or after decantationStartedAt' },
      }, 400);
    }

    // Recheck all lines server-side before COMPLETION
    if (!receipt.lines || receipt.lines.length === 0) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INCOMPLETE_LINE_DECANTATION', message: 'Cannot complete fuel receipt without tanker lines.' },
      }, 400);
    }

    for (const line of receipt.lines) {
      if (!line.preDecantReadingId || !line.postDecantReadingId) {
        return c.json({
          success: false,
          data: null,
          error: {
            code: 'INCOMPLETE_LINE_DECANTATION',
            message: `Cannot complete fuel receipt: Line for Tank #${line.tankNumber} is missing PRE or POST decantation reading.`,
          },
        }, 400);
      }

      const pre = await pumpRepo.findTankReadingById(line.preDecantReadingId);
      const post = await pumpRepo.findTankReadingById(line.postDecantReadingId);

      if (!pre || pre.readingType !== 'PRE_RECEIPT' || pre.operationalShiftId !== receipt.operationalShiftId || pre.tankId !== line.tankId || pre.productId !== line.productId) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'INVALID_DECANTATION_READING', message: `PRE reading linked to line for Tank #${line.tankNumber} is invalid or mismatched.` },
        }, 400);
      }

      if (!post || post.readingType !== 'POST_RECEIPT' || post.operationalShiftId !== receipt.operationalShiftId || post.tankId !== line.tankId || post.productId !== line.productId) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'INVALID_DECANTATION_READING', message: `POST reading linked to line for Tank #${line.tankNumber} is invalid or mismatched.` },
        }, 400);
      }

      if (post.recordedAt <= pre.recordedAt) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'INVALID_DECANTATION_TIMESTAMPS', message: `POST reading timestamp must be strictly after PRE reading timestamp.` },
        }, 400);
      }

      const measured = post.netProductVolumeMilliunits - pre.netProductVolumeMilliunits;
      if (measured < 0) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'INVALID_DECANTATION_VOLUME', message: `Measured received quantity cannot be negative.` },
        }, 400);
      }

      // Evaluate density quality at receipt event date
      const qRes = await QualityToleranceService.evaluateDensityQuality(
        db,
        receipt.outletId,
        line.productId,
        line.densityMilliunits,
        line.invoiceDensityMilliunits,
        receipt.invoiceDate || receipt.arrivalAt
      );

      await pumpRepo.updateFuelReceiptLineConditional(line.id, receipt.operationalShiftId, {
        measuredReceivedQuantityMilliunits: measured,
        receiptVarianceMilliunits: measured - line.invoiceQuantityMilliunits,
        qualityStatus: qRes.qualityStatus,
        appliedToleranceSettingId: qRes.appliedToleranceSettingId,
        appliedDensityToleranceMilliunits: qRes.appliedToleranceMilliunits,
        updatedAt: nowIso,
      });
    }
  }

  const res = await pumpRepo.updateFuelReceiptStatusConditional(id, receipt.operationalShiftId, {
    status: status as FuelReceiptStatus,
    decantationStartedAt: decStart,
    decantationCompletedAt: decComp,
    sealVerified,
    sealExceptionReason,
    updatedAt: nowIso,
  }, receipt.status);

  if (!res.success || !res.receipt) {
    if (res.finalized) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'RECEIPT_FINALIZED', message: 'Fuel receipt is finalized and cannot be modified.' },
      }, 409);
    }
    if (res.error === 'RECEIPT_STATE_CHANGED') {
      return c.json({
        success: false,
        data: res.receipt,
        error: { code: 'RECEIPT_STATE_CHANGED', message: `Fuel receipt state has changed (current status: ${res.receipt?.status || 'UNKNOWN'}).` },
      }, 409);
    }
    return c.json({
      success: false,
      data: null,
      error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED. Modifying fuel receipts on a closed shift is prohibited.' },
    }, 409);
  }

  const updated = res.receipt;

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'FUEL_RECEIPT_STATUS_UPDATE',
    entityType: 'FUEL_RECEIPT',
    entityId: id,
    oldValue: { status: receipt.status },
    newValue: { status: updated.status, decantationCompletedAt: updated.decantationCompletedAt },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updated, error: null });
});

// PATCH /api/v1/fuel-receipt-lines/:lineId - Update decantation readings & quality parameters
fuelReceipts.patch('/fuel-receipt-lines/:lineId', requirePermission(PERMISSIONS.FUEL_RECEIPTS_WRITE) as any, async (c: AppContext) => {
  const lineId = c.req.param('lineId');
  if (!lineId) return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'lineId is required' } }, 400);

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const body = await c.req.json().catch(() => ({}));
  const parseResult = FuelReceiptLineUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid line update payload', details: parseResult.error.flatten() },
    }, 400);
  }

  // Find line and parent receipt
  const [existingLine] = await db
    .select()
    .from(require('../../db/schema').fuelReceiptTankLines)
    .where(require('drizzle-orm').eq(require('../../db/schema').fuelReceiptTankLines.id, lineId));

  if (!existingLine) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Receipt line not found' } }, 404);
  }

  const receipt = await pumpRepo.findFuelReceiptById(existingLine.fuelReceiptId);
  if (!receipt) {
    return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Fuel receipt not found' } }, 404);
  }

  if (!await verifyOutletAuthority(c, receipt.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this receipt outlet' } }, 403);
  }

  if (receipt.status === 'COMPLETED' || receipt.status === 'CANCELLED') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'RECEIPT_FINALIZED', message: `Fuel receipt is ${receipt.status} and cannot be modified.` },
    }, 409);
  }

  const { preDecantReadingId, postDecantReadingId, density, temperature, invoiceDensity } = parseResult.data;

  let measuredReceivedMilli: number | null = existingLine.measuredReceivedQuantityMilliunits;
  let receiptVarianceMilli: number | null = existingLine.receiptVarianceMilliunits;

  const targetPreId = preDecantReadingId !== undefined ? preDecantReadingId : existingLine.preDecantReadingId;
  const targetPostId = postDecantReadingId !== undefined ? postDecantReadingId : existingLine.postDecantReadingId;

  if (targetPreId) {
    const preReading = await pumpRepo.findTankReadingById(targetPreId);
    if (!preReading || preReading.readingType !== 'PRE_RECEIPT' || preReading.operationalShiftId !== receipt.operationalShiftId || preReading.tankId !== existingLine.tankId || preReading.productId !== existingLine.productId) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INVALID_DECANTATION_READING', message: 'PRE reading must be a PRE_RECEIPT reading for the same shift, tank, and product.' },
      }, 400);
    }

    const [existingUsage] = await db
      .select()
      .from(schema.fuelReceiptTankLines)
      .where(
        and(
          eq(schema.fuelReceiptTankLines.preDecantReadingId, targetPreId),
          ne(schema.fuelReceiptTankLines.id, lineId)
        )
      );
    if (existingUsage) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'RECEIPT_READING_ALREADY_LINKED', message: 'PRE_RECEIPT reading is already linked to another receipt line.' },
      }, 409);
    }
  }

  if (targetPostId) {
    const postReading = await pumpRepo.findTankReadingById(targetPostId);
    if (!postReading || postReading.readingType !== 'POST_RECEIPT' || postReading.operationalShiftId !== receipt.operationalShiftId || postReading.tankId !== existingLine.tankId || postReading.productId !== existingLine.productId) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INVALID_DECANTATION_READING', message: 'POST reading must be a POST_RECEIPT reading for the same shift, tank, and product.' },
      }, 400);
    }

    const [existingUsage] = await db
      .select()
      .from(schema.fuelReceiptTankLines)
      .where(
        and(
          eq(schema.fuelReceiptTankLines.postDecantReadingId, targetPostId),
          ne(schema.fuelReceiptTankLines.id, lineId)
        )
      );
    if (existingUsage) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'RECEIPT_READING_ALREADY_LINKED', message: 'POST_RECEIPT reading is already linked to another receipt line.' },
      }, 409);
    }
  }

  if (targetPreId && targetPostId) {
    const preReading = (await pumpRepo.findTankReadingById(targetPreId))!;
    const postReading = (await pumpRepo.findTankReadingById(targetPostId))!;

    if (postReading.recordedAt <= preReading.recordedAt) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INVALID_DECANTATION_TIMESTAMPS', message: 'POST reading timestamp must be strictly after PRE reading timestamp.' },
      }, 400);
    }

    measuredReceivedMilli = postReading.netProductVolumeMilliunits - preReading.netProductVolumeMilliunits;
    if (measuredReceivedMilli < 0) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'INVALID_DECANTATION_VOLUME', message: 'Measured decantation volume cannot be negative.' },
      }, 400);
    }

    receiptVarianceMilli = measuredReceivedMilli - existingLine.invoiceQuantityMilliunits;
  }

  let densityMilli = density !== undefined ? (density ? parseMilliunits(density) : null) : existingLine.densityMilliunits;
  let tempMilli = temperature !== undefined ? (temperature ? parseMilliunits(temperature) : null) : existingLine.temperatureMilliunits;
  let invDensityMilli = invoiceDensity !== undefined ? (invoiceDensity ? parseMilliunits(invoiceDensity) : null) : existingLine.invoiceDensityMilliunits;

  let qualityStatus: QualityStatus = existingLine.qualityStatus as QualityStatus;
  let densityVarianceMilli: number | null = existingLine.densityVarianceMilliunits;
  let appliedSettingId: string | null = existingLine.appliedToleranceSettingId || null;
  let appliedToleranceMilli: number | null = existingLine.appliedDensityToleranceMilliunits || null;

  if (densityMilli != null && invDensityMilli != null) {
    const qRes = await QualityToleranceService.evaluateDensityQuality(
      db,
      receipt.outletId,
      existingLine.productId,
      densityMilli,
      invDensityMilli,
      receipt.invoiceDate || receipt.arrivalAt
    );
    qualityStatus = qRes.qualityStatus;
    densityVarianceMilli = qRes.densityVarianceMilliunits;
    appliedSettingId = qRes.appliedToleranceSettingId;
    appliedToleranceMilli = qRes.appliedToleranceMilliunits;
  }

  const nowIso = new Date().toISOString();
  const res = await pumpRepo.updateFuelReceiptLineConditional(lineId, receipt.operationalShiftId, {
    preDecantReadingId: targetPreId,
    postDecantReadingId: targetPostId,
    measuredReceivedQuantityMilliunits: measuredReceivedMilli,
    receiptVarianceMilliunits: receiptVarianceMilli,
    densityMilliunits: densityMilli,
    temperatureMilliunits: tempMilli,
    invoiceDensityMilliunits: invDensityMilli,
    densityVarianceMilliunits: densityVarianceMilli,
    qualityStatus,
    appliedToleranceSettingId: appliedSettingId,
    appliedDensityToleranceMilliunits: appliedToleranceMilli,
    updatedAt: nowIso,
  });

  if (!res.success || !res.line) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'SHIFT_CLOSED', message: 'Operational shift is CLOSED. Modifying fuel receipt lines on a closed shift is prohibited.' },
    }, 409);
  }

  const updatedLine = res.line;

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'FUEL_RECEIPT_LINE_UPDATE',
    entityType: 'FUEL_RECEIPT_LINE',
    entityId: lineId,
    oldValue: existingLine as unknown as Record<string, unknown>,
    newValue: updatedLine as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({ success: true, data: updatedLine, error: null });
});

export default fuelReceipts;
