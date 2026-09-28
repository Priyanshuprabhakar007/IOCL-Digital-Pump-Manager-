import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';

describe('IOCL Digital Pump Manager Phase 2A Pump Operations Suite', () => {
  let env: { DB: any; DOCUMENTS_BUCKET: any };
  let dbPath: string;
  let localD1: any;

  beforeEach(async () => {
    dbPath = `./.sqlite/test_pump_${Math.random().toString(36).substring(7)}.db`;
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

  // 1. Product Master Authorization
  it('1. Only GLOBAL Admin can create a new Product Master; unauthorized roles are blocked', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Dealer attempts to create product -> 403 Forbidden
    const dealerRes = await app.fetch(
      new Request('http://localhost/api/v1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
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

    // Global Admin creates product -> 201 Created
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');
    const adminRes = await app.fetch(
      new Request('http://localhost/api/v1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
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
    const adminJson = (await adminRes.json()) as any;
    expect(adminJson.success).toBe(true);
    expect(adminJson.data.code).toBe('BIO_DIESEL');

    // Duplicate product code -> 409 Conflict
    const dupRes = await app.fetch(
      new Request('http://localhost/api/v1/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          code: 'BIO_DIESEL',
          name: 'Another Bio Diesel',
          category: 'OTHER',
          unit: 'LITRE',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(dupRes.status).toBe(409);
  });

  // 2. Retail Outlet Product Mapping & Scope Control
  it('2. Outlet product mapping respects organizational scope; cross-outlet mapping is rejected', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Dealer has scope over ro-1001 (Park Street).
    // Attempting to map CNG to ro-1003 (GT Road Ludhiana) -> 403 Forbidden
    const crossRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1003/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          productId: 'prod-cng',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(crossRes.status).toBe(403);

    // Dealer mapping CNG to assigned outlet ro-1001 -> 201 Created
    const validRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          productId: 'prod-cng',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(validRes.status).toBe(201);
    const validJson = (await validRes.json()) as any;
    expect(validJson.success).toBe(true);

    // Duplicate mapping for same outlet + product -> 409 Conflict
    const dupRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          productId: 'prod-cng',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(dupRes.status).toBe(409);
  });

  // 3. Underground Tank Master Rules
  it('3. Tank master enforces capacity rules, outlet product matching, and unique tank numbers', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Rule: safe_fill_capacity_litres <= capacity_litres
    const invalidCapRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/tanks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          tankNumber: 5,
          name: 'Tank 5 Invalid Cap',
          productId: 'prod-ms',
          capacityLitres: 10000,
          safeFillCapacityLitres: 12000, // Invalid! safe fill > capacity
          minimumOperatingLevelLitres: 500,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(invalidCapRes.status).toBe(400);

    // Rule: Product must be mapped to the same outlet.
    // prod-cng is not mapped to ro-1002
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');
    const unmappedProdRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1002/tanks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          tankNumber: 1,
          name: 'Tank 1 Unmapped',
          productId: 'prod-cng',
          capacityLitres: 20000,
          safeFillCapacityLitres: 19000,
          minimumOperatingLevelLitres: 1000,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(unmappedProdRes.status).toBe(400);
    const unmappedJson = (await unmappedProdRes.json()) as any;
    expect(unmappedJson.error.code).toBe('INVALID_PRODUCT');

    // Rule: tank_number must be unique per outlet
    // ro-1001 already has Tank #1 seeded
    const dupTankRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/tanks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          tankNumber: 1, // Duplicate!
          name: 'Tank 1 Duplicate',
          productId: 'prod-ms',
          capacityLitres: 20000,
          safeFillCapacityLitres: 19000,
          minimumOperatingLevelLitres: 1000,
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(dupTankRes.status).toBe(409);
  });

  // 4. Dispenser Master & Nozzle Master Integrity
  it('4. Dispenser and Nozzle masters enforce cross-outlet isolation, uniqueness, and tank product matching', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Dispenser number must be unique per outlet (Dispenser 1 is seeded)
    const dupDispRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          dispenserNumber: 1, // Duplicate!
          name: 'Duplicate MPD',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(dupDispRes.status).toBe(409);

    // Create a new valid Dispenser 3
    const newDispRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/dispensers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          dispenserNumber: 3,
          name: 'Dispenser Unit 03 (MPD-3)',
          manufacturer: 'Tokheim',
          model: 'Quantium 510',
          serialNumber: 'TK-2023-999',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(newDispRes.status).toBe(201);
    const newDisp = (await newDispRes.json()) as any;
    const disp3Id = newDisp.data.id;

    // Nozzle: Tank product must match nozzle product.
    // Tank 1 is MS. Attempting to assign Nozzle product HSD to Tank 1 -> 400 PRODUCT_MISMATCH
    const mismatchRes = await app.fetch(
      new Request(`http://localhost/api/v1/dispensers/${disp3Id}/nozzles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          nozzleNumber: 1,
          productId: 'prod-hsd', // HSD
          tankId: 'tank-ro1-1', // MS tank!
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(mismatchRes.status).toBe(400);
    const mismatchJson = (await mismatchRes.json()) as any;
    expect(mismatchJson.error.code).toBe('PRODUCT_MISMATCH');

    // Valid nozzle configuration: MS nozzle linked to Tank 1 (MS) -> 201 Created
    const validNozzRes = await app.fetch(
      new Request(`http://localhost/api/v1/dispensers/${disp3Id}/nozzles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          nozzleNumber: 1,
          productId: 'prod-ms',
          tankId: 'tank-ro1-1',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(validNozzRes.status).toBe(201);

    // Duplicate nozzle number on same dispenser -> 409 Conflict
    const dupNozzRes = await app.fetch(
      new Request(`http://localhost/api/v1/dispensers/${disp3Id}/nozzles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          nozzleNumber: 1, // Duplicate on disp 3
          productId: 'prod-ms',
          tankId: 'tank-ro1-1',
          status: 'ACTIVE',
        }),
      }),
      env
    );
    expect(dupNozzRes.status).toBe(409);
  });

  // 5. Shift Configuration & Duplicate Prevention
  it('5. Shift templates support overnight schedules and prevent duplicate operational shifts for same date and template', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Open Shift 1 on 2026-10-01
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-10-01',
          notes: 'Standard morning shift',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const openJson = (await openRes.json()) as any;
    expect(openJson.data.status).toBe('OPEN');

    // Attempt duplicate open for same outlet + template + business date -> 409 Conflict
    const dupOpenRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-10-01',
        }),
      }),
      env
    );
    expect(dupOpenRes.status).toBe(409);
  });

  // 6. Meter Reading Math & Decimal Precision
  it('6. Meter readings calculate gross and net sales without floating-point errors', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Open shift
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-2',
          businessDate: '2026-10-02',
        }),
      }),
      env
    );
    const shiftId = ((await openRes.json()) as any).data.id;

    // Record reading:
    // Opening: 1000.125
    // Closing: 1542.875
    // Testing: 10.000
    // Expected Gross: 1542.875 - 1000.125 = 542.750
    // Expected Net: 542.750 - 10.000 = 532.750
    const readingRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: 1000.125,
          closingTotalizer: 1542.875,
          testingQuantity: 10.000,
        }),
      }),
      env
    );
    expect(readingRes.status).toBe(201);
    const readingJson = (await readingRes.json()) as any;
    expect(readingJson.data.grossSalesQuantity).toBe(542.75);
    expect(readingJson.data.netSalesQuantity).toBe(532.75);

    // Testing quantity > Gross quantity -> 400 Validation Error
    const invalidTestRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: dealerCookie,
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-2',
          openingTotalizer: 500,
          closingTotalizer: 550,
          testingQuantity: 60, // 60 > 50 gross!
        }),
      }),
      env
    );
    expect(invalidTestRes.status).toBe(400);
  });

  // 7. Opening Totalizer Continuity & Variance Auditing
  it('7. Opening totalizer continuity suggests previous closing and mandates variance_reason on discrepancy', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // 1. Open Shift A
    const shiftARes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-10-05' }),
      }),
      env
    );
    const shiftAId = ((await shiftARes.json()) as any).data.id;

    // Record reading for all 4 nozzles so shift A can be closed
    const nozzlesList = ['nozz-ro1-1-1', 'nozz-ro1-1-2', 'nozz-ro1-2-1', 'nozz-ro1-2-2'];
    for (const nId of nozzlesList) {
      await app.fetch(
        new Request(`http://localhost/api/v1/shifts/${shiftAId}/readings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
          body: JSON.stringify({
            nozzleId: nId,
            openingTotalizer: 1000,
            closingTotalizer: 1200, // Closes at 1200
            testingQuantity: 0,
          }),
        }),
        env
      );
    }

    // Close Shift A
    const closeARes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftAId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(closeARes.status).toBe(200);

    // 2. Open Shift B
    const shiftBRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-2', businessDate: '2026-10-05' }),
      }),
      env
    );
    const shiftBId = ((await shiftBRes.json()) as any).data.id;

    // Check entry grid: Suggested opening totalizer should be 1200
    const gridRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftBId}/entry-grid`, {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    const gridJson = (await gridRes.json()) as any;
    const nozzle1Grid = gridJson.data.find((g: any) => g.nozzle.id === 'nozz-ro1-1-1');
    expect(nozzle1Grid.suggestedOpeningTotalizer).toBe(1200);

    // If user enters 1250 without variance_reason -> 400 VARIANCE_REASON_REQUIRED
    const varianceNoReasonRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftBId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: 1250, // Differs from 1200!
          closingTotalizer: 1400,
          testingQuantity: 0,
        }),
      }),
      env
    );
    expect(varianceNoReasonRes.status).toBe(400);
    const varErrJson = (await varianceNoReasonRes.json()) as any;
    expect(varErrJson.error.code).toBe('VARIANCE_REASON_REQUIRED');

    // Now supply variance_reason -> accepted, marked has_opening_variance = true
    const varianceWithReasonRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftBId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-1-1',
          openingTotalizer: 1250,
          closingTotalizer: 1400,
          testingQuantity: 0,
          varianceReason: 'Meter totalizer rolled forward during maintenance testing',
        }),
      }),
      env
    );
    expect(varianceWithReasonRes.status).toBe(201);
    const varSuccessJson = (await varianceWithReasonRes.json()) as any;
    expect(varSuccessJson.data.hasOpeningVariance).toBe(true);
    expect(varSuccessJson.data.openingVarianceQuantity).toBe(50);
    expect(varSuccessJson.data.varianceReason).toBe('Meter totalizer rolled forward during maintenance testing');
  });

  // 8. Shift Closing Completeness Validation & Immutability
  it('8. Shift close requires completeness across all active nozzles; closed shifts strictly enforce immutability (HTTP 409)', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const shiftRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-10-08' }),
      }),
      env
    );
    const shiftId = ((await shiftRes.json()) as any).data.id;

    // Record reading for only 2 out of 4 nozzles
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-1', openingTotalizer: 100, closingTotalizer: 200, testingQuantity: 0 }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-2', openingTotalizer: 100, closingTotalizer: 200, testingQuantity: 0 }),
      }),
      env
    );

    // Attempt to close shift -> 400 INCOMPLETE_SHIFT_READINGS
    const prematureCloseRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(prematureCloseRes.status).toBe(400);
    const prematureJson = (await prematureCloseRes.json()) as any;
    expect(prematureJson.error.code).toBe('INCOMPLETE_SHIFT_READINGS');
    expect(prematureJson.error.details.missingCount).toBe(2);

    // Record reading for nozzle 3
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-2-1', openingTotalizer: 100, closingTotalizer: 200, testingQuantity: 0 }),
      }),
      env
    );

    // Mark nozzle 4 as unavailable with approved reason
    const unavailRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/nozzle-unavailability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          nozzleId: 'nozz-ro1-2-2',
          reason: 'Nozzle hose burst, pending replacement',
        }),
      }),
      env
    );
    expect(unavailRes.status).toBe(201);

    // Now close shift -> succeeds!
    const validCloseRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(validCloseRes.status).toBe(200);
    const validCloseJson = (await validCloseRes.json()) as any;
    expect(validCloseJson.data.status).toBe('CLOSED');

    // IMMUTABILITY TEST:
    // Any mutation attempt on a CLOSED shift must return 409 SHIFT_CLOSED

    // 1. Attempt new reading
    const newReadingOnClosed = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-2-2', openingTotalizer: 100, closingTotalizer: 200, testingQuantity: 0 }),
      }),
      env
    );
    expect(newReadingOnClosed.status).toBe(409);
    expect(((await newReadingOnClosed.json()) as any).error.code).toBe('SHIFT_CLOSED');

    // 2. Attempt nozzle unavailability change
    const unavailOnClosed = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/nozzle-unavailability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-1', reason: 'Should fail' }),
      }),
      env
    );
    expect(unavailOnClosed.status).toBe(409);
    expect(((await unavailOnClosed.json()) as any).error.code).toBe('SHIFT_CLOSED');
  });

  // 9. Authoritative Backend Sales Summary Calculation
  it('9. GET /shifts/:shiftId/sales-summary computes authoritative totals by product, dispenser, nozzle, and outlet', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const shiftRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-10-10' }),
      }),
      env
    );
    const shiftId = ((await shiftRes.json()) as any).data.id;

    // Dispenser 1 - Nozzle 1 (MS): Opening 100, Closing 300 (Gross 200), Testing 5 => Net 195
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-1', openingTotalizer: 100, closingTotalizer: 300, testingQuantity: 5 }),
      }),
      env
    );

    // Dispenser 1 - Nozzle 2 (HSD): Opening 200, Closing 500 (Gross 300), Testing 10 => Net 290
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-2', openingTotalizer: 200, closingTotalizer: 500, testingQuantity: 10 }),
      }),
      env
    );

    // Dispenser 2 - Nozzle 1 (MS): Opening 100, Closing 400 (Gross 300), Testing 0 => Net 300
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-2-1', openingTotalizer: 100, closingTotalizer: 400, testingQuantity: 0 }),
      }),
      env
    );

    // Dispenser 2 - Nozzle 2 (HSD): Mark unavailable
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/nozzle-unavailability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-2-2', reason: 'Nozzle offline for calibration' }),
      }),
      env
    );

    // Fetch authoritative sales summary
    const summaryRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/sales-summary`, {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(summaryRes.status).toBe(200);
    const summaryJson = (await summaryRes.json()) as any;
    const summary = summaryJson.data;

    // Total Outlet:
    // Gross: 200 + 300 + 300 = 800
    // Testing: 5 + 10 + 0 = 15
    // Net: 195 + 290 + 300 = 785
    expect(summary.totalOutletQuantity.grossQuantity).toBe(800);
    expect(summary.totalOutletQuantity.testingQuantity).toBe(15);
    expect(summary.totalOutletQuantity.netQuantity).toBe(785);

    // By Product:
    // MS: Gross 500, Testing 5, Net 495
    const msProd = summary.byProduct.find((p: any) => p.productId === 'prod-ms');
    expect(msProd.grossQuantity).toBe(500);
    expect(msProd.testingQuantity).toBe(5);
    expect(msProd.netQuantity).toBe(495);

    // HSD: Gross 300, Testing 10, Net 290
    const hsdProd = summary.byProduct.find((p: any) => p.productId === 'prod-hsd');
    expect(hsdProd.grossQuantity).toBe(300);
    expect(hsdProd.testingQuantity).toBe(10);
    expect(hsdProd.netQuantity).toBe(290);

    // By Dispenser:
    // Dispenser 1: Gross 500 (200 + 300), Testing 15, Net 485
    const disp1 = summary.byDispenser.find((d: any) => d.dispenserNumber === 1);
    expect(disp1.grossQuantity).toBe(500);
    expect(disp1.testingQuantity).toBe(15);
    expect(disp1.netQuantity).toBe(485);

    // Dispenser 2: Gross 300, Testing 0, Net 300
    const disp2 = summary.byDispenser.find((d: any) => d.dispenserNumber === 2);
    expect(disp2.grossQuantity).toBe(300);
    expect(disp2.testingQuantity).toBe(0);
    expect(disp2.netQuantity).toBe(300);
  });
});
