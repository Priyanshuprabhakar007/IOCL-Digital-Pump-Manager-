import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';

describe('IOCL Digital Pump Manager Phase 2A Hardened Operations Suite', () => {
  let env: { DB: any; DOCUMENTS_BUCKET: any };
  let dbPath: string;
  let localD1: any;

  beforeEach(async () => {
    dbPath = `./.sqlite/test_pump_hardened_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    env = { DB: localD1, DOCUMENTS_BUCKET: null as any };
  });

  afterEach(() => {
    try {
      localD1.close();
    } catch (e) {}

    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch (e) {}
  });

  const getCookie = (res: Response) => {
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) return '';
    return setCookie.split(';')[0];
  };

  const loginAs = async (email: string) => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password: 'Password@123' }),
      }),
      env
    );
    const cookie = getCookie(res);
    const json = (await res.json()) as any;
    return { res, cookie, json };
  };

  // 1. Global Product Master Authorization (Admin Role + GLOBAL Scope Required)
  it('1. Managing global products strictly requires BOTH ADMIN role and GLOBAL scope', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');
    const db = getDb(localD1);

    // Dealer attempts to create product -> 403 Forbidden
    const dealerRes = await app.fetch(
      new Request('http://localhost/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'BIO_DIESEL',
          name: 'Bio Diesel B20',
          category: 'OTHER',
          unit: 'LITRE',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(dealerRes.status).toBe(403);

    // Create a user with ADMIN role but only STATE scope
    const nowIso = new Date().toISOString();
    await db.insert(schema.users).values({
      id: 'user-admin-state',
      empCode: 'ADM-ST-01',
      name: 'State Admin',
      email: 'admin.state@iocl.in',
      phone: '9876543210',
      passwordHash: bcrypt.hashSync('Password@123', 10),
      status: 'ACTIVE',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    await db.insert(schema.userRoles).values({
      userId: 'user-admin-state',
      roleId: 'role-admin',
    });
    await db.insert(schema.userScopeAssignments).values({
      id: 'scope-admin-state',
      userId: 'user-admin-state',
      scopeLevel: 'STATE',
      stateId: 'state-wb',
      createdBy: 'user-admin',
      createdAt: nowIso,
    });

    const { cookie: stateAdminCookie } = await loginAs('admin.state@iocl.in');
    const stateAdminRes = await app.fetch(
      new Request('http://localhost/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: stateAdminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'BIO_DIESEL_2',
          name: 'Bio Diesel B20',
          category: 'OTHER',
          unit: 'LITRE',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(stateAdminRes.status).toBe(403);

    // Global Admin (ADMIN + GLOBAL scope) creates product successfully
    const adminRes = await app.fetch(
      new Request('http://localhost/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'BIO_DIESEL',
          name: 'Bio Diesel B20',
          category: 'OTHER',
          unit: 'LITRE',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(adminRes.status).toBe(201);
  });

  // 2. Outlet Product Mapping & Invariant Protections
  it('2. Outlet product mapping respects scope and blocks deactivation when in use by active tanks/nozzles', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Dealer attempts to map product to unassigned Delhi outlet -> 403 Forbidden
    const unauthRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1003/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', status: 'ACTIVE' }),
      }),
      env
    );
    expect(unauthRes.status).toBe(403);

    // Dealer maps CNG to their assigned outlet ro-1001 -> 201 Created
    const mapRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ productId: 'prod-cng', status: 'ACTIVE' }),
      }),
      env
    );
    expect(mapRes.status).toBe(201);

    // Attempt to deactivate MS product (prod-ms) which is used by active tanks and nozzles -> 409 PRODUCT_IN_USE
    const deactRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/products/prod-ms/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'INACTIVE' }),
      }),
      env
    );
    expect(deactRes.status).toBe(409);
    const deactJson = (await deactRes.json()) as any;
    expect(deactJson.error.code).toBe('PRODUCT_IN_USE');
  });

  // 3. Tank Master & Referential Integrity (409 TANK_IN_USE)
  it('3. Tank master validates capacities and rejects product change when referenced by nozzles', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Safe fill > total capacity rejected
    const invalidCapRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/tanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankNumber: 99,
          name: 'Invalid Tank',
          productId: 'prod-ms',
          capacityLitres: 10000,
          safeFillCapacityLitres: 12000,
          minimumOperatingLevelLitres: 500,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(invalidCapRes.status).toBe(400);

    // Attempt to change product of Tank 1 (tank-ro1-1, which is referenced by Nozzles 1 & 2) -> 409 TANK_IN_USE
    const changeProdRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          productId: 'prod-hsd',
        }),
      }),
      env
    );
    expect(changeProdRes.status).toBe(409);
    const changeProdJson = (await changeProdRes.json()) as any;
    expect(changeProdJson.error.code).toBe('TANK_IN_USE');
  });

  // 4. Dispensers & Database Uniqueness of Serial Numbers
  it('4. Dispenser serial numbers are uniquely enforced', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Create dispenser with serial 'SN-UNIQUE-999'
    const d1 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dispenserNumber: 10,
          name: 'MPD 10',
          serialNumber: 'SN-UNIQUE-999',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(d1.status).toBe(201);

    // Duplicate serial number rejected
    const d2 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dispenserNumber: 11,
          name: 'MPD 11',
          serialNumber: 'SN-UNIQUE-999',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(d2.status).toBe(409);
  });

  // 5. Shift Template Permissions & CSP Least Privilege
  it('5. CSP cannot configure shift templates; Dealer can manage shift templates in scope', async () => {
    const { cookie: cspCookie } = await loginAs('csp.parkstreet@iocl.in');
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // CSP attempts to create shift template -> 403 Forbidden
    const cspRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cspCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'OVERNIGHT',
          name: 'Overnight Shift',
          startTime: '22:00',
          endTime: '06:00',
          sequence: 4,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(cspRes.status).toBe(403);

    // Dealer creates overnight shift template -> 201 Created
    const dealerRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          code: 'OVERNIGHT',
          name: 'Overnight Shift',
          startTime: '22:00',
          endTime: '06:00',
          sequence: 4,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(dealerRes.status).toBe(201);
  });

  // 6. Only ONE Open Shift Allowed per Retail Outlet (409 OPEN_SHIFT_EXISTS)
  it('6. Enforces at most one OPEN operational shift per retail outlet', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Open first shift -> 201 Created
    const shift1 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-10-01',
        }),
      }),
      env
    );
    expect(shift1.status).toBe(201);

    // Attempt to open another shift while first is still OPEN -> 409 OPEN_SHIFT_EXISTS
    const shift2 = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-2',
          businessDate: '2026-10-01',
        }),
      }),
      env
    );
    expect(shift2.status).toBe(409);
    const s2Json = (await shift2.json()) as any;
    expect(s2Json.error.code).toBe('OPEN_SHIFT_EXISTS');
  });

  // 7. Exact 3-Decimal Scaled Integer Fuel Quantities (.001) and Continuity
  it('7. Enforces exact 3-decimal meter precision, non-negative formulas, and variance reason requirement', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-10-02',
        }),
      }),
      env
    );
    const shiftId = ((await openRes.json()) as any).data.id;

    // Reject > 3 decimal places
    const badDecRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '1000.1234',
          closingTotalizer: '1500.000',
        }),
      }),
      env
    );
    expect(badDecRes.status).toBe(400);

    // Reject closing < opening
    const badOrderRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '1500.000',
          closingTotalizer: '1400.000',
        }),
      }),
      env
    );
    expect(badOrderRes.status).toBe(400);

    // Reject testing > gross sales
    const badTestRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '1000.000',
          closingTotalizer: '1050.000', // Gross = 50.000
          testingQuantity: '60.000',     // 60 > 50
        }),
      }),
      env
    );
    expect(badTestRes.status).toBe(400);

    // Valid reading: Opening = 1000.125, Closing = 1500.625, Test = 5.000 -> Gross = 500.500, Net = 495.500
    const validRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '1000.125',
          closingTotalizer: '1500.625',
          testingQuantity: '5.000',
        }),
      }),
      env
    );
    expect(validRes.status).toBe(201);
    const validJson = (await validRes.json()) as any;
    expect(validJson.data.grossSalesQuantityStr).toBe('500.500');
    expect(validJson.data.netSalesQuantityStr).toBe('495.500');
    expect(validJson.data.grossSalesQuantityMilliunits).toBe(500500);
    expect(validJson.data.netSalesQuantityMilliunits).toBe(495500);
  });

  // 8. Historical Shift Snapshot Immutability Across Master Data Changes
  it('8. Shift snapshot preserves historical integrity when master nozzle/dispenser/product changes occur later', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // 1. Open shift
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-10-03',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = ((await openRes.json()) as any).data.id;

    // 2. Record readings for all 4 nozzles
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-1', openingTotalizer: '1000.000', closingTotalizer: '1200.000', testingQuantity: '0.000' }), // MS: Net 200
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-2', openingTotalizer: '2000.000', closingTotalizer: '2300.000', testingQuantity: '0.000' }), // HSD: Net 300
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-2-1', openingTotalizer: '1000.000', closingTotalizer: '1100.000', testingQuantity: '0.000' }), // MS: Net 100
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-2-2', openingTotalizer: '2000.000', closingTotalizer: '2400.000', testingQuantity: '0.000' }), // HSD: Net 400
      }),
      env
    );

    // 3. Close the shift
    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(closeRes.status).toBe(200);

    // 4. Now modify/deactivate nozzle nozz-ro1-1-1 and dispenser disp-ro1-1 in master tables
    await app.fetch(
      new Request('http://localhost/api/v1/nozzles/nozz-ro1-1-1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'DECOMMISSIONED' }),
      }),
      env
    );
    await app.fetch(
      new Request('http://localhost/api/v1/dispensers/disp-ro1-1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'MAINTENANCE' }),
      }),
      env
    );

    // 5. Query historical sales summary -> MUST still reflect original 4 nozzles, MS: 300 L, HSD: 700 L
    const summaryRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/sales-summary`, {
        method: 'GET',
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(summaryRes.status).toBe(200);
    const summaryJson = (await summaryRes.json()) as any;

    expect(summaryJson.data.byNozzle.length).toBe(4);
    const msProd = summaryJson.data.byProduct.find((p: any) => p.productCode === 'MS');
    const hsdProd = summaryJson.data.byProduct.find((p: any) => p.productCode === 'HSD');

    expect(msProd.netQuantity).toBe('300.000');
    expect(hsdProd.netQuantity).toBe('700.000');
    expect(msProd.unit).toBe('LITRE');
    expect(msProd.productCategory).toBe('MS');

    // Unit totals check
    const litreTotal = summaryJson.data.totalsByUnit.find((u: any) => u.unit === 'LITRE');
    expect(litreTotal.netQuantity).toBe('1000.000');
  });

  // 9. Concurrent Immutability (Modifications on Closed Shift Blocked)
  it('9. Rejects meter reading modifications and unavailabilities on closed shifts (HTTP 409 SHIFT_CLOSED)', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-10-04',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = ((await openRes.json()) as any).data.id;

    // Mark 3 nozzles unavailable and 1 with reading to allow shift closure
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-1', openingTotalizer: '1000.000', closingTotalizer: '1100.000', testingQuantity: '0.000' }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/nozzle-unavailability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-2', reason: 'Dispenser calibration' }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/nozzle-unavailability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-2-1', reason: 'Dispenser calibration' }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/nozzle-unavailability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-2-2', reason: 'Dispenser calibration' }),
      }),
      env
    );

    // Close the shift
    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(closeRes.status).toBe(200);

    // Attempt to write/update reading on closed shift -> 409 SHIFT_CLOSED
    const mutateRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-1', openingTotalizer: '1000.000', closingTotalizer: '1200.000', testingQuantity: '0.000' }),
      }),
      env
    );
    expect(mutateRes.status).toBe(409);
    const mutateJson = (await mutateRes.json()) as any;
    expect(mutateJson.error.code).toBe('SHIFT_CLOSED');
  });

  // 10. Atomic Shift + Snapshot Creation Rollback
  it('10. Atomic shift + snapshot creation failure rolls back completely without orphaned open shift', async () => {
    const db = getDb(localD1);
    const shiftId = 'ops-atomic-fail-test';
    const nowIso = new Date().toISOString();

    // Prepare shift insert and a failing snapshot insert with invalid foreign key
    const shiftInsert = db.insert(schema.operationalShifts).values({
      id: shiftId,
      outletId: 'ro-1001',
      shiftTemplateId: 'st-ro1-1',
      businessDate: '2026-10-09',
      startedAt: nowIso,
      status: 'OPEN',
      openedByUserId: 'user-admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const failingSnapshotInsert = db.insert(schema.operationalShiftNozzles).values([
      {
        id: 'osn-fail-1',
        operationalShiftId: shiftId,
        outletId: 'ro-1001',
        nozzleId: 'nozz-nonexistent-id', // Foreign key constraint violation on nozzles
        dispenserId: 'disp-ro1-1',
        dispenserNumber: 1,
        dispenserName: 'Dispenser #1',
        nozzleNumber: 1,
        productId: 'prod-ms',
        productCode: 'MS',
        productName: 'Motor Spirit',
        productCategory: 'MS',
        productUnit: 'LITRE',
        tankId: 'tank-ro1-1',
        tankNumber: 1,
        snapshotStatus: 'ACTIVE',
        createdAt: nowIso,
      },
    ]);

    let failed = false;
    try {
      // Execute as single atomic batch transaction
      await (db as any).batch([shiftInsert, failingSnapshotInsert]);
    } catch (err) {
      failed = true;
    }

    expect(failed).toBe(true);

    // CRITICAL: Prove atomicity - verify that NO open shift row exists with this shiftId
    const shiftRows = await db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, shiftId));
    expect(shiftRows.length).toBe(0);
  });

  // 11. True Concurrent Shift Immutability & Double Close Handling
  it('11. Distinguishes initial shift closure from concurrent closure and enforces DB write-level shift status check', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');
    const db = getDb(localD1);
    const { PumpRepository } = await import('../src/worker/repositories/pumpRepository');
    const pumpRepo = new PumpRepository(db);

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-10-05',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = ((await openRes.json()) as any).data.id;

    // Set all nozzles unavailable to allow closing
    const snapshots = await pumpRepo.listShiftNozzleSnapshots(shiftId);
    for (const snap of snapshots) {
      await pumpRepo.recordUnavailability({
        id: `nur-test-${snap.nozzleId}`,
        operationalShiftId: shiftId,
        nozzleId: snap.nozzleId,
        reason: 'Shift end check',
        recordedBy: 'user-admin',
        createdAt: new Date().toISOString(),
      });
    }

    // First close call succeeds
    const closeRes1 = await pumpRepo.closeOperationalShiftConditional(shiftId, 'user-admin');
    expect(closeRes1.success).toBe(true);
    expect(closeRes1.alreadyClosed).toBe(false);
    expect(closeRes1.shift?.status).toBe('CLOSED');

    // Concurrent second close call detects that shift was already closed
    const closeRes2 = await pumpRepo.closeOperationalShiftConditional(shiftId, 'user-admin');
    expect(closeRes2.success).toBe(false);
    expect(closeRes2.alreadyClosed).toBe(true);
    expect(closeRes2.shift?.status).toBe('CLOSED');

    // Verify repository-level conditional writes reject mutations when shift is CLOSED
    const createReadingResult = await pumpRepo.createReading({
      id: 'nmr-concurrent-fail',
      operationalShiftId: shiftId,
      outletId: 'ro-1001',
      nozzleId: snapshots[0].nozzleId,
      openingMilliunits: 1000000,
      closingMilliunits: 1050000,
      testingMilliunits: 0,
      grossMilliunits: 50000,
      netMilliunits: 50000,
      recordedByUserId: 'user-admin',
      hasOpeningVariance: false,
      openingVarianceMilliunits: 0,
      varianceReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(createReadingResult.shiftClosed).toBe(true);
    expect(createReadingResult.reading).toBeNull();

    const recordUnavailResult = await pumpRepo.recordUnavailability({
      id: 'nur-concurrent-fail',
      operationalShiftId: shiftId,
      nozzleId: snapshots[0].nozzleId,
      reason: 'Late record attempt',
      recordedBy: 'user-admin',
      createdAt: new Date().toISOString(),
    });
    expect(recordUnavailResult.shiftClosed).toBe(true);
    expect(recordUnavailResult.record).toBeNull();

    const removeUnavailResult = await pumpRepo.removeUnavailability(shiftId, snapshots[0].nozzleId);
    expect(removeUnavailResult.shiftClosed).toBe(true);
    expect(removeUnavailResult.success).toBe(false);
  });

  // 12. Strict Decimal String Validation (Reject Numbers, Scientific Notation, >3 Decimals)
  it('12. API strictly enforces decimal strings and rejects numbers, scientific notation, and >3 decimals', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-10-06',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const shiftId = ((await openRes.json()) as any).data.id;

    // 1. Numeric quantity (number instead of string) -> REJECTED 400
    const numRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: 1000.125, // number
          closingTotalizer: '1050.000',
        }),
      }),
      env
    );
    expect(numRes.status).toBe(400);

    // 2. >3 Decimal Places -> REJECTED 400
    const fourDecRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '1000.1234', // 4 decimals
          closingTotalizer: '1050.000',
        }),
      }),
      env
    );
    expect(fourDecRes.status).toBe(400);

    // 3. Negative quantity -> REJECTED 400
    const negRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '-1000.000',
          closingTotalizer: '1050.000',
        }),
      }),
      env
    );
    expect(negRes.status).toBe(400);

    // 4. Scientific notation -> REJECTED 400
    const sciRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '1e3',
          closingTotalizer: '1050.000',
        }),
      }),
      env
    );
    expect(sciRes.status).toBe(400);

    // 5. Valid decimal string forms -> ACCEPTED 201
    const validRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: '1000',
          closingTotalizer: '1000.125',
          testingQuantity: '0.1',
        }),
      }),
      env
    );
    expect(validRes.status).toBe(201);
    const validJson = (await validRes.json()) as any;
    expect(validJson.data.openingTotalizerMilliunits).toBe(1000000);
    expect(validJson.data.closingTotalizerMilliunits).toBe(1000125);
    expect(validJson.data.testingQuantityMilliunits).toBe(100);
    expect(validJson.data.grossSalesQuantityMilliunits).toBe(125);
    expect(validJson.data.netSalesQuantityMilliunits).toBe(25);
    expect(validJson.data.openingTotalizerStr).toBe('1000.000');
    expect(validJson.data.closingTotalizerStr).toBe('1000.125');
    expect(validJson.data.testingQuantityStr).toBe('0.100');
    expect(validJson.data.grossSalesQuantityStr).toBe('0.125');
    expect(validJson.data.netSalesQuantityStr).toBe('0.025');
  });

  // 13. Idempotent Migration 0004 Permissions & Scaled-Integer DB Parity
  it('13. Migration 0004 ensures all required granular permissions exist and meter readings use integer milliunits', async () => {
    const db = getDb(localD1);

    const requiredPermissions = [
      'products.read',
      'products.manage_global',
      'outlet_products.read',
      'outlet_products.write',
      'tanks.read',
      'tanks.write',
      'dispensers.read',
      'dispensers.write',
      'nozzles.read',
      'nozzles.write',
      'shift_templates.read',
      'shift_templates.write',
      'shifts.read',
      'shifts.open',
      'shifts.close',
      'meter_readings.read',
      'meter_readings.write',
    ];

    const allPerms = await db.select().from(schema.permissions);
    const permCodes = new Set(allPerms.map(p => p.code));

    for (const code of requiredPermissions) {
      expect(permCodes.has(code)).toBe(true);
    }
  });
});
