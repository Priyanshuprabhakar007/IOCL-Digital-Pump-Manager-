import { Hono } from 'hono';
import { getDb } from '../../db';
import { CngRepository } from '../repositories/cngRepository';
import { PumpRepository } from '../repositories/pumpRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { CngService } from '../services/cngService';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { CngShiftLogSchema, CngPressureReadingSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';

export const cngRoutes = new Hono<{ Bindings: EnvBindings }>();

cngRoutes.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

function getServices(c: AppContext) {
  const db = getDb(c.env.DB);
  const cngRepo = new CngRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);
  const outletRepo = new OutletRepository(db);
  const cngService = new CngService(cngRepo, pumpRepo, auditRepo);
  return { cngService, pumpRepo, outletRepo };
}

// GET /shifts/:shiftId/cng-log
cngRoutes.get('/shifts/:shiftId/cng-log', requirePermission(PERMISSIONS.CNG_OPERATIONS_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId')!;
  const { cngService, pumpRepo, outletRepo } = getServices(c);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const log = await cngService.getShiftLog(shiftId);
  return c.json({ success: true, data: log, error: null });
});

// PUT /shifts/:shiftId/cng-log
cngRoutes.put('/shifts/:shiftId/cng-log', requirePermission(PERMISSIONS.CNG_OPERATIONS_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId')!;
  const { cngService, pumpRepo, outletRepo } = getServices(c);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = CngShiftLogSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() } }, 400);
  }

  const res = await cngService.upsertShiftLog(shiftId, c.var.user!.user.id, parseResult.data);
  if (!res.success) {
    const status = (res.error === 'SHIFT_CLOSED' || res.error === 'CNG_NOT_AVAILABLE_AT_OUTLET') ? 409 : 400;
    return c.json({ success: false, data: null, error: { code: res.error!, message: 'Upsert failed' } }, status);
  }

  return c.json({ success: true, data: res.log, error: null });
});

// GET /shifts/:shiftId/cng-pressure-readings
cngRoutes.get('/shifts/:shiftId/cng-pressure-readings', requirePermission(PERMISSIONS.CNG_OPERATIONS_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId')!;
  const { cngService, pumpRepo, outletRepo } = getServices(c);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const list = await cngService.listPressureReadings(shiftId);
  return c.json({ success: true, data: list, error: null });
});

// POST /shifts/:shiftId/cng-pressure-readings
cngRoutes.post('/shifts/:shiftId/cng-pressure-readings', requirePermission(PERMISSIONS.CNG_OPERATIONS_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId')!;
  const { cngService, pumpRepo, outletRepo } = getServices(c);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = CngPressureReadingSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() } }, 400);
  }

  const res = await cngService.createPressureReading(shiftId, c.var.user!.user.id, parseResult.data);
  if (!res.success) {
    const status = (res.error === 'SHIFT_CLOSED' || res.error === 'CNG_NOT_AVAILABLE_AT_OUTLET') ? 409 : 400;
    return c.json({ success: false, data: null, error: { code: res.error!, message: 'Create failed' } }, status);
  }

  return c.json({ success: true, data: res.reading, error: null }, 201);
});

// PUT /cng-pressure-readings/:id
cngRoutes.put('/cng-pressure-readings/:id', requirePermission(PERMISSIONS.CNG_OPERATIONS_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id')!;
  const { cngService, outletRepo } = getServices(c);
  const db = getDb(c.env.DB);
  const cngRepo = new CngRepository(db);

  const reading = await cngRepo.findPressureReadingById(id);
  if (!reading) return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Reading not found' } }, 404);

  if (!await verifyOutletAuthority(c, reading.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = CngPressureReadingSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.flatten() } }, 400);
  }

  const res = await cngService.updatePressureReading(id, c.var.user!.user.id, parseResult.data);
  if (!res.success) {
    const status = res.error === 'SHIFT_CLOSED' ? 409 : (res.error === 'NOT_FOUND' ? 404 : 400);
    return c.json({ success: false, data: null, error: { code: res.error!, message: 'Update failed' } }, status);
  }

  return c.json({ success: true, data: res.reading, error: null });
});

// DELETE /cng-pressure-readings/:id
cngRoutes.delete('/cng-pressure-readings/:id', requirePermission(PERMISSIONS.CNG_OPERATIONS_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id')!;
  const { cngService, outletRepo } = getServices(c);
  const db = getDb(c.env.DB);
  const cngRepo = new CngRepository(db);

  const reading = await cngRepo.findPressureReadingById(id);
  if (!reading) return c.json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Reading not found' } }, 404);

  if (!await verifyOutletAuthority(c, reading.outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const res = await cngService.deletePressureReading(id, c.var.user!.user.id);
  if (!res.success) {
    const status = res.error === 'SHIFT_CLOSED' ? 409 : (res.error === 'NOT_FOUND' ? 404 : 400);
    return c.json({ success: false, data: null, error: { code: res.error!, message: 'Delete failed' } }, status);
  }

  return c.json({ success: true, data: null, error: null });
});

// GET /outlets/:outletId/cng/daily-summary?businessDate=YYYY-MM-DD
cngRoutes.get('/outlets/:outletId/cng/daily-summary', requirePermission(PERMISSIONS.CNG_OPERATIONS_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId')!;
  const businessDate = c.req.query('businessDate')!;
  if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'businessDate in YYYY-MM-DD format is required' } }, 400);
  }

  const { cngService, outletRepo } = getServices(c);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const summary = await cngService.getDailySummary(outletId, businessDate);
  return c.json({ success: true, data: summary, error: null });
});
