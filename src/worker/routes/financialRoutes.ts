import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { getDb } from '../../db';
import { FinancialRepository } from '../repositories/financialRepository';
import { FinancialService } from '../services/financialService';
import { PumpRepository } from '../repositories/pumpRepository';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { ScopeService } from '../services/scopeService';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { 
  ProductPriceSchema, 
  CreditPartySchema, 
  ShiftCollectionSchema, 
  CashHandoverSchema, 
  BankDepositSchema,
  FinancialVarianceReasonSchema
} from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';
import { parseMoneyToPaise, formatPaiseToMoney } from '../../shared/financialUtils';

const financialRoutes = new Hono<{ Bindings: EnvBindings }>();

financialRoutes.use('*', requireAuth as any);

async function verifyOutletAuthority(c: AppContext, outletId: string, outletRepo: OutletRepository): Promise<boolean> {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  return ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
}

// ==========================================
// PRODUCT PRICES
// ==========================================

financialRoutes.get('/outlets/:outletId/product-prices', requirePermission(PERMISSIONS.PRODUCT_PRICES_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletRepo = new OutletRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const list = await repo.listProductPrices(outletId);
  const formatted = list.map(p => ({
    ...p,
    pricePerUnitStr: formatPaiseToMoney(p.pricePaisePerUnit)
  }));

  return c.json({ success: true, data: formatted });
});

financialRoutes.post('/outlets/:outletId/product-prices', requirePermission(PERMISSIONS.PRODUCT_PRICES_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletRepo = new OutletRepository(db);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const validated = ProductPriceSchema.parse(body);

  // Validate product and mapping
  const product = await pumpRepo.findProductById(validated.productId);
  if (!product || product.status !== 'ACTIVE' || product.unit !== 'LITRE') {
    return c.json({ success: false, error: { code: 'INVALID_PRODUCT', message: 'Product must be ACTIVE and LITRE unit' } }, 400);
  }

  const mapping = await pumpRepo.findOutletProduct(outletId, validated.productId);
  if (!mapping || mapping.status !== 'ACTIVE') {
    return c.json({ success: false, error: { code: 'PRODUCT_NOT_MAPPED', message: 'Product is not actively mapped to this outlet' } }, 400);
  }

  // Check overlap
  const overlap = await repo.checkPriceOverlap(outletId, validated.productId, validated.effectiveFrom, validated.effectiveTo || null);
  if (overlap) {
    return c.json({ success: false, error: { code: 'OVERLAPPING_PRODUCT_PRICE', message: 'An active price already exists for this period' } }, 409);
  }

  const id = `pri-${crypto.randomUUID()}`;
  const price = await repo.createProductPrice({
    id,
    outletId,
    productId: validated.productId,
    pricePaisePerUnit: parseMoneyToPaise(validated.pricePaisePerUnit),
    effectiveFrom: validated.effectiveFrom,
    effectiveTo: validated.effectiveTo || null,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    createdBy: c.var.user!.user.id
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'PRODUCT_PRICE_CREATE',
    entityType: 'PRODUCT_PRICE',
    entityId: id,
    newValue: price as any,
    createdAt: new Date().toISOString()
  });

  return c.json({ success: true, data: price }, 201);
});

financialRoutes.put('/product-prices/:id', requirePermission(PERMISSIONS.PRODUCT_PRICES_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const existing = await repo.findProductPriceById(id);
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Price record not found' } }, 404);

  if (!await verifyOutletAuthority(c, existing.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const validated = ProductPriceSchema.parse(body);

  const overlap = await repo.checkPriceOverlap(existing.outletId, validated.productId, validated.effectiveFrom, validated.effectiveTo || null, id);
  if (overlap) {
    return c.json({ success: false, error: { code: 'OVERLAPPING_PRODUCT_PRICE', message: 'An active price already exists for this period' } }, 409);
  }

  const updated = await repo.updateProductPrice(id, {
    productId: validated.productId,
    pricePaisePerUnit: parseMoneyToPaise(validated.pricePaisePerUnit),
    effectiveFrom: validated.effectiveFrom,
    effectiveTo: validated.effectiveTo || null,
    updatedAt: new Date().toISOString()
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'PRODUCT_PRICE_UPDATE',
    entityType: 'PRODUCT_PRICE',
    entityId: id,
    oldValue: existing as any,
    newValue: updated as any,
    createdAt: new Date().toISOString()
  });

  return c.json({ success: true, data: updated });
});

// ==========================================
// CREDIT PARTIES
// ==========================================

financialRoutes.get('/outlets/:outletId/credit-parties', requirePermission(PERMISSIONS.CREDIT_PARTIES_READ) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletRepo = new OutletRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const list = await repo.listCreditParties(outletId);
  return c.json({ success: true, data: list });
});

financialRoutes.post('/outlets/:outletId/credit-parties', requirePermission(PERMISSIONS.CREDIT_PARTIES_WRITE) as any, async (c: AppContext) => {
  const outletId = c.req.param('outletId');
  if (!outletId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'outletId is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  if (!await verifyOutletAuthority(c, outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const validated = CreditPartySchema.parse(body);

  const existing = await repo.findCreditPartyByCode(outletId, validated.partyCode);
  if (existing) return c.json({ success: false, error: { code: 'CONFLICT', message: 'Party code already exists for this outlet' } }, 409);

  const id = `cpt-${crypto.randomUUID()}`;
  const party = await repo.createCreditParty({
    id,
    outletId,
    ...validated,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: c.var.user!.user.id
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'CREDIT_PARTY_CREATE',
    entityType: 'CREDIT_PARTY',
    entityId: id,
    newValue: party as any,
    createdAt: new Date().toISOString()
  });

  return c.json({ success: true, data: party }, 201);
});

financialRoutes.put('/credit-parties/:id', requirePermission(PERMISSIONS.CREDIT_PARTIES_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const existing = await repo.findCreditPartyById(id);
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Credit party not found' } }, 404);

  if (!await verifyOutletAuthority(c, existing.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const validated = CreditPartySchema.parse(body);

  const updated = await repo.updateCreditParty(id, {
    ...validated,
    updatedAt: new Date().toISOString()
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'CREDIT_PARTY_UPDATE',
    entityType: 'CREDIT_PARTY',
    entityId: id,
    oldValue: existing as any,
    newValue: updated as any,
    createdAt: new Date().toISOString()
  });

  return c.json({ success: true, data: updated });
});

// ==========================================
// COLLECTIONS
// ==========================================

financialRoutes.get('/shifts/:shiftId/collections', requirePermission(PERMISSIONS.COLLECTIONS_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const pumpRepo = new PumpRepository(db);
  const outletRepo = new OutletRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this shift' } }, 403);
  }

  const list = await repo.listCollections(shiftId);
  const formatted = list.map(col => ({
    ...col,
    amountStr: formatPaiseToMoney(col.amountPaise)
  }));

  return c.json({ success: true, data: formatted });
});

financialRoutes.post('/shifts/:shiftId/collections', requirePermission(PERMISSIONS.COLLECTIONS_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const pumpRepo = new PumpRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this shift' } }, 403);
  }

  if (shift.status !== 'OPEN') {
    return c.json({ success: false, error: { code: 'SHIFT_CLOSED', message: 'Shift is not OPEN for collection entry' } }, 409);
  }

  const body = await c.req.json();
  const validated = ShiftCollectionSchema.parse(body);

  let snapshotCode = null;
  let snapshotName = null;

  if (validated.collectionType === 'CREDIT_SALE') {
    const party = await repo.findCreditPartyById(validated.creditPartyId!);
    if (!party || party.status !== 'ACTIVE' || party.outletId !== shift.outletId) {
      return c.json({ success: false, error: { code: 'INVALID_CREDIT_PARTY', message: 'Active credit party from same outlet is required' } }, 400);
    }
    snapshotCode = party.partyCode;
    snapshotName = party.partyName;
  }

  const id = `col-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  
  const { collection, shiftClosed } = await repo.createCollection({
    id,
    operationalShiftId: shiftId,
    outletId: shift.outletId,
    collectionType: validated.collectionType,
    amountPaise: parseMoneyToPaise(validated.amount),
    provider: validated.provider || null,
    referenceNumber: validated.referenceNumber || null,
    creditPartyId: validated.creditPartyId || null,
    creditPartyCodeSnapshot: snapshotCode,
    creditPartyNameSnapshot: snapshotName,
    collectedAt: validated.collectedAt,
    recordedByUserId: c.var.user!.user.id,
    notes: validated.notes || null,
    createdAt: now,
    updatedAt: now
  });

  if (shiftClosed) {
    return c.json({ success: false, error: { code: 'SHIFT_CLOSED', message: 'Shift was closed concurrently' } }, 409);
  }

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'COLLECTION_CREATE',
    entityType: 'SHIFT_COLLECTION',
    entityId: id,
    newValue: collection as any,
    createdAt: now
  });

  return c.json({ success: true, data: collection }, 201);
});

financialRoutes.delete('/collections/:id', requirePermission(PERMISSIONS.COLLECTIONS_WRITE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const existing = await repo.findCollectionById(id);
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Collection not found' } }, 404);

  if (!await verifyOutletAuthority(c, existing.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const { shiftClosed } = await repo.deleteCollection(id);
  if (shiftClosed) {
    return c.json({ success: false, error: { code: 'SHIFT_CLOSED', message: 'Shift is not OPEN' } }, 409);
  }

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'COLLECTION_DELETE',
    entityType: 'SHIFT_COLLECTION',
    entityId: id,
    oldValue: existing as any,
    createdAt: new Date().toISOString()
  });

  return c.json({ success: true, data: { message: 'Collection removed' } });
});

// ==========================================
// CASH HANDOVERS
// ==========================================

financialRoutes.get('/shifts/:shiftId/cash-handovers', requirePermission(PERMISSIONS.CASH_HANDOVER_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const pumpRepo = new PumpRepository(db);
  const outletRepo = new OutletRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this shift' } }, 403);
  }

  const list = await repo.listCashHandovers(shiftId);
  const formatted = list.map(h => ({
    ...h,
    amountStr: formatPaiseToMoney(h.amountPaise)
  }));

  return c.json({ success: true, data: formatted });
});

financialRoutes.post('/shifts/:shiftId/cash-handovers', requirePermission(PERMISSIONS.CASH_HANDOVER_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const pumpRepo = new PumpRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this shift' } }, 403);
  }

  if (shift.status !== 'OPEN') {
    return c.json({ success: false, error: { code: 'SHIFT_CLOSED', message: 'Shift is not OPEN for handover entry' } }, 409);
  }

  const body = await c.req.json();
  const validated = CashHandoverSchema.parse(body);

  const id = `hnd-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const { handover, shiftClosed } = await repo.createCashHandover({
    id,
    operationalShiftId: shiftId,
    outletId: shift.outletId,
    amountPaise: parseMoneyToPaise(validated.amount),
    handedOverByUserId: c.var.user!.user.id,
    handedOverAt: validated.handedOverAt,
    notes: validated.notes || null,
    createdAt: now,
    updatedAt: now
  });

  if (shiftClosed) {
    return c.json({ success: false, error: { code: 'SHIFT_CLOSED', message: 'Shift was closed concurrently' } }, 409);
  }

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'CASH_HANDOVER_CREATE',
    entityType: 'CASH_HANDOVER',
    entityId: id,
    newValue: handover as any,
    createdAt: now
  });

  return c.json({ success: true, data: handover }, 201);
});

financialRoutes.patch('/cash-handovers/:id/status', requirePermission(PERMISSIONS.CASH_HANDOVER_ACKNOWLEDGE) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const existing = await repo.findCashHandoverById(id);
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Handover not found' } }, 404);

  if (!await verifyOutletAuthority(c, existing.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const status = body.status;
  if (!['ACKNOWLEDGED', 'DISPUTED'].includes(status)) {
    return c.json({ success: false, error: { code: 'INVALID_STATUS', message: 'Valid statuses: ACKNOWLEDGED, DISPUTED' } }, 400);
  }

  // Prevent same user from acknowledging their own handover
  if (status === 'ACKNOWLEDGED' && existing.handedOverByUserId === c.var.user!.user.id) {
    return c.json({ success: false, error: { code: 'SELF_ACKNOWLEDGEMENT_PROHIBITED', message: 'You cannot acknowledge your own handover' } }, 400);
  }

  const updated = await repo.updateCashHandoverStatus(id, {
    status,
    receivedByUserId: c.var.user!.user.id,
    receivedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'CASH_HANDOVER_STATUS_UPDATE',
    entityType: 'CASH_HANDOVER',
    entityId: id,
    oldValue: { status: existing.status },
    newValue: { status },
    createdAt: new Date().toISOString()
  });

  return c.json({ success: true, data: updated });
});

// ==========================================
// BANK DEPOSITS
// ==========================================

financialRoutes.get('/shifts/:shiftId/bank-deposits', requirePermission(PERMISSIONS.BANK_DEPOSITS_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const pumpRepo = new PumpRepository(db);
  const outletRepo = new OutletRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this shift' } }, 403);
  }

  const list = await repo.listBankDeposits(shiftId);
  const formatted = list.map(d => ({
    ...d,
    amountStr: formatPaiseToMoney(d.amountPaise)
  }));

  return c.json({ success: true, data: formatted });
});

financialRoutes.post('/shifts/:shiftId/bank-deposits', requirePermission(PERMISSIONS.BANK_DEPOSITS_WRITE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const pumpRepo = new PumpRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this shift' } }, 403);
  }

  const body = await c.req.json();
  const validated = BankDepositSchema.parse(body);

  if (validated.documentId) {
    const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, validated.documentId));
    if (!doc || doc.outletId !== shift.outletId) {
       return c.json({ success: false, error: { code: 'INVALID_DOCUMENT', message: 'Document does not exist or belongs to another outlet' } }, 400);
    }
  }

  const id = `dep-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const deposit = await repo.createBankDeposit({
    id,
    outletId: shift.outletId,
    operationalShiftId: shiftId,
    depositChannel: validated.depositChannel,
    amountPaise: parseMoneyToPaise(validated.amount),
    depositDate: validated.depositDate,
    referenceNumber: validated.referenceNumber || null,
    documentId: validated.documentId || null,
    status: 'SUBMITTED',
    recordedByUserId: c.var.user!.user.id,
    createdAt: now,
    updatedAt: now
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'BANK_DEPOSIT_CREATE',
    entityType: 'BANK_DEPOSIT',
    entityId: id,
    newValue: deposit as any,
    createdAt: now
  });

  return c.json({ success: true, data: deposit }, 201);
});

financialRoutes.patch('/bank-deposits/:id/status', requirePermission(PERMISSIONS.BANK_DEPOSITS_VERIFY) as any, async (c: AppContext) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'id is required' } }, 400);

  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  const existing = await repo.findBankDepositById(id);
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Deposit not found' } }, 404);

  if (!await verifyOutletAuthority(c, existing.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this outlet' } }, 403);
  }

  const body = await c.req.json();
  const status = body.status;
  if (!['VERIFIED', 'REJECTED'].includes(status)) {
    return c.json({ success: false, error: { code: 'INVALID_STATUS', message: 'Valid statuses: VERIFIED, REJECTED' } }, 400);
  }

  if (status === 'REJECTED' && !body.rejectionReason) {
    return c.json({ success: false, error: { code: 'REJECTION_REASON_REQUIRED', message: 'Reason is required for rejection' } }, 400);
  }

  const updated = await repo.updateBankDepositStatus(id, {
    status,
    verifiedByUserId: c.var.user!.user.id,
    verifiedAt: new Date().toISOString(),
    rejectionReason: body.rejectionReason || null,
    updatedAt: new Date().toISOString()
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'BANK_DEPOSIT_STATUS_UPDATE',
    entityType: 'BANK_DEPOSIT',
    entityId: id,
    oldValue: { status: existing.status },
    newValue: { status, reason: body.rejectionReason },
    createdAt: new Date().toISOString()
  });

  return c.json({ success: true, data: updated });
});

// ==========================================
// FINANCIAL SUMMARY & RECONCILE
// ==========================================

financialRoutes.get('/shifts/:shiftId/financial-summary', requirePermission(PERMISSIONS.FINANCIAL_RECONCILIATION_READ) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const financialRepo = new FinancialRepository(db);
  const pumpRepo = new PumpRepository(db);
  const outletRepo = new OutletRepository(db);
  const service = new FinancialService(financialRepo, pumpRepo);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this shift' } }, 403);
  }

  try {
    const summary = await service.getShiftFinancialSummary(shiftId);
    return c.json({ success: true, data: summary });
  } catch (err: any) {
    if (err.message === 'FINANCIAL_PRICE_SNAPSHOT_UNAVAILABLE') {
       return c.json({ success: false, error: { code: 'PRICE_SNAPSHOT_MISSING', message: 'This is a legacy shift without a historical price snapshot' } }, 400);
    }
    throw err;
  }
});

financialRoutes.post('/shifts/:shiftId/financial-reconcile', requirePermission(PERMISSIONS.SHIFTS_CLOSE) as any, async (c: AppContext) => {
  const shiftId = c.req.param('shiftId');
  if (!shiftId) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'shiftId is required' } }, 400);

  const db = getDb(c.env.DB);
  const financialRepo = new FinancialRepository(db);
  const pumpRepo = new PumpRepository(db);
  const outletRepo = new OutletRepository(db);
  const service = new FinancialService(financialRepo, pumpRepo);
  const auditRepo = new AuditRepository(db);

  const shift = await pumpRepo.findOperationalShiftById(shiftId);
  if (!shift) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);

  if (!await verifyOutletAuthority(c, shift.outletId, outletRepo)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No authority over this shift' } }, 403);
  }

  const body = await c.req.json();
  const varianceReason = body.varianceReason;

  const recon = await service.performFinancialReconciliation(shiftId, varianceReason);
  
  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user!.user.id,
    action: 'FINANCIAL_RECONCILIATION_PERFORMED',
    entityType: 'OPERATIONAL_SHIFT',
    entityId: shiftId,
    newValue: recon as any,
    createdAt: new Date().toISOString()
  });

  return c.json({ success: true, data: recon });
});

export default financialRoutes;
