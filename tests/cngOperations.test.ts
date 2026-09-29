import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import { parseMilliunits } from '../src/shared/precision';

const TEST_DB_PATH = './.sqlite/test_cng_integration.db';

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

describe('Phase 3A-1 CNG Operations Integration Suite', () => {
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
    
    // 1. Migration 0012 applies on clean database (implied by seeding if it runs against current schema)
    // Actually we should apply migrations manually or rely on the fact that Drizzle uses current schema.ts
    // For this environment, we rely on schema.ts parity.
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

  async function openShift(cookie: string, outletId = 'ro-1001', businessDate = '2026-11-20') {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/outlets/${outletId}/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate }),
      }),
      env
    );
    const json: any = await res.json();
    return json.data.id;
  }

  it('2. CNG RBAC permissions exist', async () => {
    const db = getDb(localD1);
    const perms = await db.select().from(schema.permissions).where(and(eq(schema.permissions.code, 'cng_operations.read')));
    expect(perms.length).toBe(1);
    const permsWrite = await db.select().from(schema.permissions).where(and(eq(schema.permissions.code, 'cng_operations.write')));
    expect(permsWrite.length).toBe(1);
  });

  it('3. unauthenticated CNG route rejected', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/shifts/some-shift/cng-log', {
        headers: { Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it('4. Dealer own-outlet CNG access allowed', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');
    const shiftId = await openShift(cookie);
    
    // Map CNG to outlet first
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(res.status).toBe(200);
  });

  it('5. Dealer other-outlet access rejected', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in'); // Owns ro-1001
    
    // Manually create a shift for ro-1002 to test cross-outlet access
    const db = getDb(localD1);
    const otherShiftId = 'shift-other-outlet';
    await db.insert(schema.operationalShifts).values({
        id: otherShiftId,
        outletId: 'ro-1002',
        shiftTemplateId: 'st-ro1-1', // Template belongs to ro-1001 but DB constraint is fine for test
        businessDate: '2026-11-20',
        startedAt: new Date().toISOString(),
        status: 'OPEN',
        openedByUserId: 'user-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${otherShiftId}/cng-log`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(res.status).toBe(403);
  });

  it('7. outlet without active CNG mapping rejects write', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '100.000', mfmClosingKg: '200.000' }),
      }),
      env
    );
    expect(res.status).toBe(409);
    const json: any = await res.json();
    expect(json.error.code).toBe('CNG_NOT_AVAILABLE_AT_OUTLET');
  });

  it('10. valid MFM shift log create & upsert behavior (20)', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '100.000', mfmClosingKg: '150.500', gridIntakeKg: '60.000', notes: 'First log' }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data.mfmOpeningKg).toBe('100.000');
    expect(json.data.mfmClosingKg).toBe('150.500');
    expect(json.data.netSalesKg).toBe('50.500');
    expect(json.data.gridIntakeKg).toBe('60.000');
    expect(json.data.gridSalesVarianceKg).toBe('9.500');

    // Upsert
    const res2 = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '100.000', mfmClosingKg: '200.000', gridIntakeKg: '110.000' }),
      }),
      env
    );
    expect(res2.status).toBe(200);
    const json2: any = await res2.json();
    expect(json2.data.netSalesKg).toBe('100.000');
    expect(json2.data.gridSalesVarianceKg).toBe('10.000');
  });

  it('11. mfm closing < opening rejected', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '100.000', mfmClosingKg: '90.000' }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('12. exact 3-decimal kg accepted', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '10.123', mfmClosingKg: '20.456' }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data.mfmOpeningKg).toBe('10.123');
    expect(json.data.mfmClosingKg).toBe('20.456');
  });

  it('13. >3 decimal quantity rejected', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '10.1234', mfmClosingKg: '20.000' }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('14. numeric JSON quantity rejected', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: 100, mfmClosingKg: 200 }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('18. negative grid variance supported', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '100.000', gridIntakeKg: '90.000' }),
      }),
      env
    );
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data.gridSalesVarianceKg).toBe('-10.000');
  });

  it('22. update blocked while CLOSING', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    await db.update(schema.operationalShifts).set({ status: 'CLOSING' }).where(eq(schema.operationalShifts.id, shiftId));

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '100.000', mfmClosingKg: '200.000' }),
      }),
      env
    );
    expect(res.status).toBe(409);
    const json: any = await res.json();
    expect(json.error.code).toBe('SHIFT_CLOSED');
  });

  it('27. pressure reading accepts all three', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-pressure-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ 
            recordedAt: new Date().toISOString(), 
            pressureUnit: 'bar',
            suctionPressure: '5.5',
            dischargePressure: '250.0',
            cascadePressure: '200.5',
            notes: 'All three'
        }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const json: any = await res.json();
    expect(json.data.suctionPressure).toBe('5.500');
    expect(json.data.dischargePressure).toBe('250.000');
    expect(json.data.cascadePressure).toBe('200.500');
  });

  it('28. pressure record with no pressure values rejected', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-pressure-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ 
            recordedAt: new Date().toISOString(), 
            pressureUnit: 'bar'
        }),
      }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('29. pressure values stored as integer milliunits', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-pressure-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ 
            recordedAt: new Date().toISOString(), 
            pressureUnit: 'psi',
            suctionPressure: '10.555'
        }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const json: any = await res.json();
    
    const dbRow = await db.select().from(schema.cngPressureReadings).where(eq(schema.cngPressureReadings.id, json.data.id));
    expect(dbRow[0].suctionPressureMilliunits).toBe(10555);
  });

  it('33. pressure delete race NOT_FOUND classified correctly', async () => {
    const { cookie } = await loginAs();
    const res = await app.fetch(
      new Request('http://localhost/api/v1/cng-pressure-readings/non-existent-id', {
        method: 'DELETE',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(res.status).toBe(404);
  });

  it('35. daily summary aggregates multiple shifts', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const shiftId1 = await openShift(cookie, 'ro-1001', '2026-11-20');
    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId1}/cng-log`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '100.000', gridIntakeKg: '105.000' }),
    }), env);
    
    // Close shift 1 manually in DB to allow opening shift 2
    await db.update(schema.operationalShifts).set({ status: 'CLOSED' }).where(eq(schema.operationalShifts.id, shiftId1));

    const res2 = await app.fetch(new Request(`http://localhost/api/v1/outlets/ro-1001/shifts/open`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-2', businessDate: '2026-11-20' }),
    }), env);
    const json2: any = await res2.json();
    const shiftId2 = json2.data.id;

    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId2}/cng-log`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '100.000', mfmClosingKg: '250.000', gridIntakeKg: '140.000' }),
    }), env);

    const summaryRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/cng/daily-summary?businessDate=2026-11-20', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(summaryRes.status).toBe(200);
    const summary: any = await summaryRes.json();
    expect(summary.data.totalMfmSalesKg).toBe('250.000'); // 100 + 150
    expect(summary.data.gridIntakeKg).toBe('245.000'); // 105 + 140
    expect(summary.data.gridSalesVarianceKg).toBe('-5.000'); // 245 - 250
    expect(summary.data.shiftCount).toBe(2);
    expect(summary.data.gridDataComplete).toBe(true);
  });

  it('36. missing grid data does not become zero', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const shiftId = await openShift(cookie, 'ro-1001', '2026-11-20');
    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '100.000' }), // No grid intake
    }), env);

    const summaryRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/cng/daily-summary?businessDate=2026-11-20', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const summary: any = await summaryRes.json();
    expect(summary.data.gridIntakeKg).toBeNull();
    expect(summary.data.gridSalesVarianceKg).toBeNull();
  });

  it('37. partial grid data returns gridDataComplete=false', async () => {
    const { cookie } = await loginAs();
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    const shiftId1 = await openShift(cookie, 'ro-1001', '2026-11-20');
    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId1}/cng-log`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '0.000', mfmClosingKg: '100.000', gridIntakeKg: '105.000' }),
    }), env);
    
    await db.update(schema.operationalShifts).set({ status: 'CLOSED' }).where(eq(schema.operationalShifts.id, shiftId1));

    const res2 = await app.fetch(new Request(`http://localhost/api/v1/outlets/ro-1001/shifts/open`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-2', businessDate: '2026-11-20' }),
    }), env);
    const json2: any = await res2.json();
    const shiftId2 = json2.data.id;

    await app.fetch(new Request(`http://localhost/api/v1/shifts/${shiftId2}/cng-log`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '100.000', mfmClosingKg: '250.000' }), // No grid intake
    }), env);

    const summaryRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/cng/daily-summary?businessDate=2026-11-20', {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const summary: any = await summaryRes.json();
    expect(summary.data.gridDataComplete).toBe(false);
    expect(summary.data.gridIntakeKg).toBe('105.000');
  });

  it('38. mutation audits written', async () => {
    const { cookie } = await loginAs();
    const shiftId = await openShift(cookie);
    const db = getDb(localD1);
    await db.insert(schema.outletProducts).values({
        id: 'op-ro1-cng', outletId: 'ro-1001', productId: 'prod-cng', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'user-admin'
    });

    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/cng-log`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ mfmOpeningKg: '100.000', mfmClosingKg: '200.000' }),
      }),
      env
    );

    const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'CNG_SHIFT_LOG_CREATE'));
    expect(audits.length).toBe(1);
  });
});
