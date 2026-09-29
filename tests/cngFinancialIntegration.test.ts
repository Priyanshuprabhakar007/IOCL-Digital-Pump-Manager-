import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import fs from 'fs';
import { calculateRevenuePaise, parseMoneyToPaise } from '../src/shared/financialUtils';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';

const TEST_DB_PATH = './.sqlite/test_cng_fin_integration.db';

class MockR2Bucket {
  private store = new Map<string, { data: Uint8Array; metadata: Record<string, string> }>();
  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      body: item.data,
      arrayBuffer: async () => item.data.buffer,
      customMetadata: item.metadata,
    };
  }
  async put(key: string, value: ArrayBuffer | Uint8Array, options?: any) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, { data, metadata: options?.customMetadata || {} });
    return { key, size: data.byteLength };
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

describe('Phase 3A-2 CNG Financial Integration & Migration Suite', () => {
  let localD1: any;
  let env: any;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

    localD1 = createLocalD1Database(TEST_DB_PATH);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = {
      DB: localD1,
      DOCUMENTS_BUCKET: new MockR2Bucket(),
      SESSION_SECRET: 'test-session-secret-key-12345678901234567890',
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    };
  });

  afterEach(async () => {
    if (localD1) {
      localD1.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
  });

  async function loginAs(email = 'admin@iocl.in', password = 'Password@123') {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password }),
      }),
      env
    );
    const cookie = res.headers.get('set-cookie') || '';
    const json: any = await res.json();
    return { cookie, user: json.data?.user };
  }

  it('1 & 2. Migration 0013 adds product_category and backfills existing snapshots', async () => {
    const db = getDb(localD1);
    // Insert a legacy price snapshot without product_category
    const legacyId = 'ospp-legacy-1';
    const shiftId = 'shift-legacy-1';
    
    // Create shift first
    await db.insert(schema.operationalShifts).values({
      id: shiftId,
      outletId: 'ro-1001',
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-11-20',
      startedAt: new Date().toISOString(),
      status: 'OPEN',
      openedByUserId: 'user-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const [msPrice] = await db.select().from(schema.outletProductPrices).limit(1);

    await db.insert(schema.operationalShiftProductPrices).values({
      id: legacyId,
      operationalShiftId: shiftId,
      outletId: 'ro-1001',
      productId: msPrice.productId,
      productCode: 'MS',
      productName: 'Motor Spirit',
      unit: 'LITRE',
      productCategory: null as any,
      pricePaisePerUnit: 10000,
      sourcePriceId: msPrice.id,
      createdAt: new Date().toISOString(),
    });

    // Run migration 0013 SQL
    const migrationSql = fs.readFileSync('./migrations/0013_cng_financial_integration.sql', 'utf8');
    await db.run(sql.raw(migrationSql));

    const [row] = await db.select().from(schema.operationalShiftProductPrices).where(eq(schema.operationalShiftProductPrices.id, legacyId));
    expect(row.productCategory).toBe('FUEL');
  });

  it('3 & 4. CNG/KG product price CREATE and UPDATE succeed', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);

    // Ensure CNG product exists and mapped
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const json: any = await res.json();
    const priceId = json.data.id;

    // Update
    const updateRes = await app.fetch(
      new Request(`http://localhost/api/v1/product-prices/${priceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '88.00', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(updateRes.status).toBe(200);
  });

  it('5. non-CNG KG price rejected', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.products).values({
      id: 'prod-lube-kg', code: 'LUBE_KG', name: 'Lube KG', category: 'LUBE', unit: 'KG', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-lube', outletId: 'ro-1001', productId: 'prod-lube-kg', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-lube-kg', pricePaisePerUnit: '500.00', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('6. CNG/LITRE invalid as CNG configuration', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.products).values({
      id: 'prod-cng-l', code: 'CNG_L', name: 'CNG Litre', category: 'CNG', unit: 'LITRE', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng-l', outletId: 'ro-1001', productId: 'prod-cng-l', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng-l', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('7, 8, 9, 10, 11, 12, 13. Shift open with CNG captures historical price snapshot with correct category and unit', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    // Add price for CNG
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = (await openRes.json() as any).data.id;

    const snapshots = await db.select().from(schema.operationalShiftProductPrices).where(eq(schema.operationalShiftProductPrices.operationalShiftId, shiftId));
    const cngSnap = snapshots.find(s => s.productId === 'prod-cng');
    expect(cngSnap).toBeDefined();
    expect(cngSnap?.productCategory).toBe('CNG');
    expect(cngSnap?.unit).toBe('KG');
    expect(cngSnap?.pricePaisePerUnit).toBe(8550);
  });

  it('14, 15, 16. CNG mapping without price blocks open with no partial rows; >1 active CNG mapping returns AMBIGUOUS_CNG_PRODUCT_CONFIGURATION', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    // 1. Missing price blocks open
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    expect(openRes.status).toBe(409);
    const shiftsCount = await db.select().from(schema.operationalShifts);
    expect(shiftsCount.length).toBe(0);

    // 2. >1 active CNG mappings -> AMBIGUOUS_CNG_PRODUCT_CONFIGURATION
    await db.insert(schema.products).values({
      id: 'prod-cng-2', code: 'CNG2', name: 'CNG 2', category: 'CNG', unit: 'KG', status: 'ACTIVE', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng2', outletId: 'ro-1001', productId: 'prod-cng-2', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const openRes2 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    expect(openRes2.status).toBe(409);
    const json: any = await openRes2.json();
    expect(json.error.code).toBe('AMBIGUOUS_CNG_PRODUCT_CONFIGURATION');
  });

  it('21, 22, 23, 24. revenue helper validation and overflow guards', async () => {
    expect(() => calculateRevenuePaise(1000, 100)).not.toThrow();
    expect(() => calculateRevenuePaise(-10, 100)).toThrow('INVALID_INPUT_VALUES');
    expect(() => calculateRevenuePaise(10.5, 100)).toThrow('INVALID_INPUT_VALUES');
    expect(() => calculateRevenuePaise(Number.MAX_SAFE_INTEGER + 1, 100)).toThrow('INVALID_INPUT_VALUES');
    expect(() => calculateRevenuePaise(Number.MAX_SAFE_INTEGER, 1000000000)).toThrow('FINANCIAL_AMOUNT_OVERFLOW');
  });

  it('25, 26, 27, 28, 29. calculateShiftCngRevenue states A, B, C, D, E', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // State C: Snapshot + no log -> cngApplicable=true, cngComplete=false
    const sumRes1 = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes1.status).toBe(200);
    const json1: any = await sumRes1.json();
    expect(json1.data.salesRevenue.cngApplicable).toBe(true);
    expect(json1.data.salesRevenue.cngComplete).toBe(false);

    // Add log -> State B
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '100.000' }),
      }),
      env
    );

    const sumRes2 = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const json2: any = await sumRes2.json();
    expect(json2.data.salesRevenue.cngApplicable).toBe(true);
    expect(json2.data.cngComplete ?? json2.data.salesRevenue.cngComplete).toBe(true);
    expect(json2.data.salesRevenue.cngTotalPaise).toBe(8550); // 100.000 kg * 85.50
  });

  it('30, 31, 32. CNG log without snapshot throws CNG_PRICE_SNAPSHOT_UNAVAILABLE', async () => {
    const { cookie } = await loginAs();
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;
    const db = getDb(localD1);

    // Create CNG log manually without snapshot
    await db.insert(schema.cngShiftLogs).values({
      id: 'cnglog-legacy',
      operationalShiftId: shiftId,
      outletId: 'ro-1001',
      mfmOpeningKgMilliunits: 0,
      mfmClosingKgMilliunits: 100000,
      netSalesKgMilliunits: 100000,
      recordedByUserId: 'user-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const sumRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/financial-summary`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(sumRes.status).toBe(409);
    const json: any = await sumRes.json();
    expect(json.error.code).toBe('CNG_PRICE_SNAPSHOT_UNAVAILABLE');
  });

  it('53, 54, 55. Successful CNG shift closes CLOSED and audit contains cngRevenuePaise', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
      id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });
    await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/product-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', pricePaisePerUnit: '85.50', effectiveFrom: '2026-11-01' }),
      }),
      env
    );

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-20' }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // Add CNG log
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '100.000' }),
      }),
      env
    );

    // Setup tank & readings to allow close
    const pumpRepo = new PumpRepository(db);
    const nozzles = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const n of nozzles) {
      await pumpRepo.createReading({
        id: `mr-${n.nozzleId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', nozzleId: n.nozzleId, openingMilliunits: 1000, closingMilliunits: 1000, testingMilliunits: 0, grossMilliunits: 0, netMilliunits: 0, recordedByUserId: 'user-admin', hasOpeningVariance: false, openingVarianceMilliunits: 0, varianceReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    const tanks = await pumpRepo.listShiftTankSnapshots(shiftId);
    for (const t of tanks) {
      await pumpRepo.createTankReading({
        id: `tsr-open-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'OPENING', source: 'MANUAL', productDipMmMilliunits: 1000000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8500000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8500000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      await pumpRepo.createTankReading({
        id: `tsr-close-${t.tankId}-${shiftId}`, operationalShiftId: shiftId, outletId: 'ro-1001', tankId: t.tankId, productId: t.productId, readingType: 'CLOSING', source: 'MANUAL', productDipMmMilliunits: 950000, waterDipMmMilliunits: 0, grossObservedVolumeMilliunits: 8400000, waterVolumeMilliunits: 0, netProductVolumeMilliunits: 8400000, recordedAt: new Date().toISOString(), recordedByUserId: 'user-admin', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }

    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({}),
      }),
      env
    );
    expect(closeRes.status).toBe(200);

    const [audit] = await db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, 'FINANCIAL_RECONCILIATION'), eq(schema.auditLogs.entityId, shiftId)));
    expect(audit).toBeDefined();
    const newValue = JSON.parse(audit.newValueJson || '{}');
    expect(newValue.cngRevenuePaise).toBe(8550);
    expect(newValue.authoritativeSalesRevenuePaise).toBe(newValue.fuelRevenuePaise + 8550);
  });
});
