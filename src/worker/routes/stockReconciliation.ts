import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';

export const stockReconciliation = new Hono<{ Bindings: EnvBindings }>();

stockReconciliation.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

// GET /api/v1/shifts/:shiftId/stock-reconciliation - Get authoritative stock reconciliation report
stockReconciliation.get('/shifts/:shiftId/stock-reconciliation', requirePermission(PERMISSIONS.STOCK_RECONCILIATION_READ) as any, async (c: AppContext) => {
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

  const summary = await pumpRepo.getShiftStockSummary(shiftId);
  return c.json({ success: true, data: summary, error: null });
});

// POST /api/v1/shifts/:shiftId/stock-reconciliation/compute - Compute and save stock reconciliation
stockReconciliation.post('/shifts/:shiftId/stock-reconciliation/compute', requirePermission(PERMISSIONS.STOCK_RECONCILIATION_READ) as any, async (c: AppContext) => {
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

  const results = await pumpRepo.calculateAndSaveShiftStockReconciliation(shiftId);

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'STOCK_RECONCILIATION_COMPUTE',
    entityType: 'STOCK_RECONCILIATION',
    entityId: shiftId,
    newValue: { tanksCount: results.length } as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ success: true, data: results, error: null });
});

export default stockReconciliation;
