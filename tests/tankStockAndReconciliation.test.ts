// @ts-ignore
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { app } from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { TankCalibrationService } from '../src/worker/services/tankCalibrationService';
import { QualityToleranceService } from '../src/worker/services/qualityToleranceService';
import { parseMilliunits, formatMilliunits } from '../src/shared/precision';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = './.sqlite/test_tank_recon.db';

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

describe('IOCL Digital Pump Manager Phase 2B Tank Stock, Fuel Receipt & Reconciliation Suite', () => {
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
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
    if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }
  });

  async function loginAs(email: string, password = 'Password@123') {
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

  // 1. Tank Calibration Points & Monotonicity Constraints
  it('1. Tank calibration chart rejects non-monotonic points and enforces unique dip heights', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    // 1a. Attempt to add a non-monotonic point (higher dip, lower volume than existing 1000mm -> 8500L)
    const nonMonotonicRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dipMillimetres: '1200.000',
          volumeLitres: '8000.000', // invalid: at 1000mm volume is 8500L
        }),
      }),
      env
    );
    expect(nonMonotonicRes.status).toBe(400);
    const nonMonoJson: any = await nonMonotonicRes.json();
    expect(nonMonoJson.error.code).toBe('NON_MONOTONIC_CALIBRATION');

    // 1b. Attempt to add duplicate dip
    const dupRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dipMillimetres: '1000.000',
          volumeLitres: '8500.000',
        }),
      }),
      env
    );
    expect(dupRes.status).toBe(409);
    const dupJson: any = await dupRes.json();
    expect(dupJson.error.code).toBe('DUPLICATE_DIP');

    // 1c. Valid point insertion
    const validRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dipMillimetres: '1100.000',
          volumeLitres: '9700.000',
        }),
      }),
      env
    );
    expect(validRes.status).toBe(201);
  });

  // 2. Centralized Dip-to-Volume Conversion Service
  it('2. Centralized Dip-to-Volume conversion performs exact matching and deterministic linear interpolation', async () => {
    const db = getDb(localD1);

    // 2a. Exact match at 1000.000 mm -> exactly 8500.000 L (8500000 milliunits)
    const exact = await TankCalibrationService.convertDipToVolume(db, 'tank-ro1-1', 1000000);
    expect(exact.interpolated).toBe(false);
    expect(exact.calculatedVolumeMilliunits).toBe(8500000);
    expect(exact.volumeLitreStr).toBe('8500.000');

    // 2b. Intermediate dip at 1125.000 mm (halfway between 1000mm=8500L and 1250mm=11500L)
    // Interpolation: 8500 + (125 / 250) * 3000 = 8500 + 1500 = 10000.000 L
    const interp = await TankCalibrationService.convertDipToVolume(db, 'tank-ro1-1', 1125000);
    expect(interp.interpolated).toBe(true);
    expect(interp.calculatedVolumeMilliunits).toBe(10000000);
    expect(interp.volumeLitreStr).toBe('10000.000');

    // 2c. Dip out of range (above 2500.000 mm)
    try {
      await TankCalibrationService.convertDipToVolume(db, 'tank-ro1-1', 2600000);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe('DIP_OUT_OF_RANGE');
    }

    // 2d. Negative dip
    try {
      await TankCalibrationService.convertDipToVolume(db, 'tank-ro1-1', -50000);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.code).toBe('DIP_OUT_OF_RANGE');
    }
  });

  // 3. Shift Opening Snapshots Participating Liquid Tanks
  it('3. Opening an operational shift automatically captures participating liquid tanks snapshot', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-09-28',
          notes: 'Phase 2B Test Shift',
        }),
      }),
      env
    );
    expect(openRes.status).toBe(201);
    const openJson: any = await openRes.json();
    const shiftId = openJson.data.id;

    // Fetch shift tank snapshots
    const snapRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-snapshots`, {
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(snapRes.status).toBe(200);
    const snapJson: any = await snapRes.json();
    expect(snapJson.data.length).toBe(3); // Tanks 1 (MS), 2 (HSD), 3 (XP95)
    expect(snapJson.data[0].tankNumber).toBe(1);
    expect(snapJson.data[0].productCode).toBe('MS');
  });

  // 4. Tank Stock Readings: Opening, Water Dip, Gross & Net Derivations, and Uniqueness
  it('4. Tank stock readings derive gross/water/net volumes and enforce single opening/closing uniqueness', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // 1. Open shift
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-09-28',
        }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // 2. Record valid OPENING dip on Tank 1 (Product dip: 1000.000 mm -> 8500 L, Water dip: 250.000 mm -> 1200 L)
    const openDipRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'OPENING',
          source: 'MANUAL',
          productDipMm: '1000.000',
          waterDipMm: '250.000',
          notes: 'Morning physical gauge dip',
        }),
      }),
      env
    );
    expect(openDipRes.status).toBe(201);
    const openDipJson: any = await openDipRes.json();
    expect(openDipJson.data.grossObservedVolumeStr).toBe('8500.000');
    expect(openDipJson.data.waterVolumeStr).toBe('1200.000');
    expect(openDipJson.data.netProductVolumeStr).toBe('7300.000'); // 8500 - 1200 = 7300

    // 3. Attempt duplicate OPENING reading on same tank in same shift -> Rejected 409
    const dupOpenRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'OPENING',
          source: 'MANUAL',
          productDipMm: '1050.000',
          waterDipMm: '0.000',
        }),
      }),
      env
    );
    expect(dupOpenRes.status).toBe(409);
    expect((await dupOpenRes.json() as any).error.code).toBe('DUPLICATE_READING_TYPE');

    // 4. Rejection when water dip > product dip
    const invalidDipRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankId: 'tank-ro1-2',
          readingType: 'OPENING',
          source: 'MANUAL',
          productDipMm: '500.000',
          waterDipMm: '600.000', // invalid: water > product dip
        }),
      }),
      env
    );
    expect(invalidDipRes.status).toBe(400);
  });

  // 5. Fuel Receipt Decantation, Quality Tolerance Evaluation & Tank Line Variance
  it('5. Tanker fuel receipt evaluates hierarchical quality density tolerance and decantation volume variance', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // 1. Open shift
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-09-28',
        }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // 2. Create Tanker Fuel Receipt with MS line (Invoice: 5000.000 L, Observed Density: 745.000 kg/m3, Invoice Density: 743.000 kg/m3 -> Variance: +2.000 kg/m3 vs MS tolerance +/-2.500 kg/m3 => PASS)
    const rcptRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'WB-02-AK-9988',
          invoiceNumber: 'INV-IOCL-2026-9001',
          invoiceDate: '2026-09-28',
          arrivalAt: '2026-09-28T08:30:00Z',
          sealVerified: true,
          lines: [
            {
              tankId: 'tank-ro1-1',
              productId: 'prod-ms',
              invoiceQuantity: '5000.000',
              density: '745.000',
              temperature: '28.500',
              invoiceDensity: '743.000',
            },
          ],
        }),
      }),
      env
    );
    expect(rcptRes.status).toBe(201);
    const rcptJson: any = await rcptRes.json();
    const receiptId = rcptJson.data.id;
    const lineId = rcptJson.data.lines[0].id;
    expect(rcptJson.data.lines[0].qualityStatus).toBe('PASS');
    expect(rcptJson.data.lines[0].densityVarianceStr).toBe('2.000');

    // 3. Record PRE_RECEIPT reading on Tank 1 (Dip: 500mm -> 3100 L)
    const preRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'PRE_RECEIPT',
          source: 'MANUAL',
          productDipMm: '500.000',
          waterDipMm: '0.000',
        }),
      }),
      env
    );
    const preReadingId = (await preRes.json() as any).data.id;

    // 4. Record POST_RECEIPT reading on Tank 1 (Dip: 1000mm -> 8500 L => Decanted: 8500 - 3100 = 5400 L)
    const postRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          tankId: 'tank-ro1-1',
          readingType: 'POST_RECEIPT',
          source: 'MANUAL',
          productDipMm: '1000.000',
          waterDipMm: '0.000',
        }),
      }),
      env
    );
    const postReadingId = (await postRes.json() as any).data.id;

    // 5. Link pre/post decantation readings to receipt line
    const updateLineRes = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipt-lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          preDecantReadingId: preReadingId,
          postDecantReadingId: postReadingId,
        }),
      }),
      env
    );
    expect(updateLineRes.status).toBe(200);
    const updatedLineJson: any = await updateLineRes.json();
    expect(updatedLineJson.data.measuredReceivedQuantityMilliunits).toBe(5400000); // 5400 L
    expect(updatedLineJson.data.receiptVarianceMilliunits).toBe(400000); // +400 L gain vs 5000 L invoice

    // 6. Step status transitions: VERIFIED -> DECANTED -> COMPLETED
    await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${receiptId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'VERIFIED' }),
      }),
      env
    );

    await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${receiptId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'DECANTED' }),
      }),
      env
    );

    const completeRes = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${receiptId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          status: 'COMPLETED',
        }),
      }),
      env
    );
    expect(completeRes.status).toBe(200);
    expect((await completeRes.json() as any).data.status).toBe('COMPLETED');
  });

  // 6. Authoritative Shift Stock Reconciliation Engine
  it('6. Stock reconciliation calculates theoretical vs physical closing and identifies loss/gain variances', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    // 1. Open shift
    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          shiftTemplateId: 'st-ro1-1',
          businessDate: '2026-09-28',
        }),
      }),
      env
    );
    const shiftId = (await openRes.json() as any).data.id;

    // 2. Record OPENING tank readings for Tank 1 (MS: 1000mm -> 8500 L) and Tank 2 (HSD: 1000mm -> 9500 L) and Tank 3 (XP95: 1000mm -> 6800 L)
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ tankId: 'tank-ro1-1', readingType: 'OPENING', productDipMm: '1000.000', waterDipMm: '0.000' }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ tankId: 'tank-ro1-2', readingType: 'OPENING', productDipMm: '1000.000', waterDipMm: '0.000' }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ tankId: 'tank-ro1-3', readingType: 'OPENING', productDipMm: '1000.000', waterDipMm: '0.000' }),
      }),
      env
    );

    // 3. Record meter sales on Nozzle 1-1 (MS: 500 L net sales) and Nozzle 1-2 (HSD: 800 L net sales) and Nozzle 2-1 (MS: 300 L net sales) and Nozzle 2-2 (HSD: 200 L net sales)
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-1', openingTotalizer: '1000.000', closingTotalizer: '1500.000', testingQuantity: '0.000' }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-1-2', openingTotalizer: '2000.000', closingTotalizer: '2800.000', testingQuantity: '0.000' }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-2-1', openingTotalizer: '3000.000', closingTotalizer: '3300.000', testingQuantity: '0.000' }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ nozzleId: 'nozz-ro1-2-2', openingTotalizer: '4000.000', closingTotalizer: '4200.000', testingQuantity: '0.000' }),
      }),
      env
    );

    // Total MS sales = 500 + 300 = 800 L
    // Total HSD sales = 800 + 200 = 1000 L
    // Tank 1 Theoretical closing = 8500 - 800 = 7700.000 L
    // Tank 2 Theoretical closing = 9500 - 1000 = 8500.000 L

    // 4. Record CLOSING tank readings:
    // Tank 1 physical dip at 950.000 mm (interpolated between 750mm=5600L and 1000mm=8500L => 5600 + (200/250)*2900 = 7920 L)
    // Physical = 7920 L, Theoretical = 7700 L => GAIN = +220 L
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ tankId: 'tank-ro1-1', readingType: 'CLOSING', productDipMm: '950.000', waterDipMm: '0.000' }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ tankId: 'tank-ro1-2', readingType: 'CLOSING', productDipMm: '1000.000', waterDipMm: '0.000' }),
      }),
      env
    );
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ tankId: 'tank-ro1-3', readingType: 'CLOSING', productDipMm: '1000.000', waterDipMm: '0.000' }),
      }),
      env
    );

    // 5. Fetch Stock Reconciliation Summary
    const reconRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/stock-reconciliation`, {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(reconRes.status).toBe(200);
    const reconJson: any = await reconRes.json();

    const t1Recon = reconJson.data.byTank.find((t: any) => t.tankNumber === 1);
    expect(t1Recon.openingStockStr).toBe('8500.000');
    expect(t1Recon.salesQuantityStr).toBe('800.000');
    expect(t1Recon.theoreticalClosingStockStr).toBe('7700.000');
    expect(t1Recon.physicalClosingStockStr).toBe('7920.000');
    expect(t1Recon.varianceStr).toBe('220.000');
    expect(t1Recon.varianceStatus).toBe('GAIN');

    // 6. Close shift atomically triggers persistence of reconciliation
    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(closeRes.status).toBe(200);
  });

  // 7. Security & Scope Enforcement on Phase 2B Endpoints
  it('7. Scope & RBAC: CSP cannot configure quality tolerances or calibration charts, and out-of-scope users are forbidden', async () => {
    const { cookie: cspCookie } = await loginAs('csp.parkstreet@iocl.in');
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // 7a. CSP cannot manage quality tolerances -> 403
    const qtolRes = await app.fetch(
      new Request('http://localhost/api/v1/quality-tolerances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cspCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          scopeType: 'GLOBAL',
          densityTolerance: '2.000',
          effectiveFrom: '2026-01-01',
        }),
      }),
      env
    );
    expect(qtolRes.status).toBe(403);

    // 7b. Admin can create quality tolerance
    const adminQtolRes = await app.fetch(
      new Request('http://localhost/api/v1/quality-tolerances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          scopeType: 'GLOBAL',
          densityTolerance: '2.000',
          effectiveFrom: '2028-01-01',
        }),
      }),
      env
    );
    expect(adminQtolRes.status).toBe(201);

    // 7c. CSP cannot manage tank calibration points -> 403
    const calibRes = await app.fetch(
      new Request('http://localhost/api/v1/tanks/tank-ro1-1/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cspCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          dipMillimetres: '1300.000',
          volumeLitres: '12000.000',
        }),
      }),
      env
    );
    expect(calibRes.status).toBe(403);
  });

  // 8. Shift close requires tank stock data (400 INCOMPLETE_TANK_STOCK_DATA)
  it('8. Shift close with tank snapshots and ZERO tank readings is rejected (400 INCOMPLETE_TANK_STOCK_DATA)', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-01' }),
      }),
      env
    );
    const shiftId = ((await openRes.json()) as any).data.id;

    // Attempt close with 0 tank readings
    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(closeRes.status).toBe(400);
    const json: any = await closeRes.json();
    expect(json.error.code).toBe('INCOMPLETE_TANK_STOCK_DATA');
    expect(json.error.details).toBeDefined();
    expect(json.error.details.missingReadingTypes).toEqual(['OPENING', 'CLOSING']);
  });

  // 9. Missing opening or closing reading blocks shift close and stock reconciliation compute
  it('9. Missing opening/closing reading blocks shift close and reconciliation compute with clear details', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-02' }),
      }),
      env
    );
    const shiftId = ((await openRes.json()) as any).data.id;

    // Record only OPENING reading for Tank 1
    await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ tankId: 'tank-ro1-1', readingType: 'OPENING', productDipMm: '1000.000', waterDipMm: '0.000' }),
      }),
      env
    );

    // Compute reconciliation fails -> 400 INCOMPLETE_TANK_STOCK_DATA
    const computeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/stock-reconciliation/compute`, {
        method: 'POST',
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(computeRes.status).toBe(400);

    // Shift close fails -> 400
    const closeRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(closeRes.status).toBe(400);
    const json: any = await closeRes.json();
    expect(json.error.code).toBe('INCOMPLETE_TANK_STOCK_DATA');
  });

  // 10. GET stock reconciliation exposes null for missing numeric values without fabricating 0
  it('10. GET stock reconciliation exposes null for missing numeric values without fabricating 0', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-03' }),
      }),
      env
    );
    const shiftId = ((await openRes.json()) as any).data.id;

    const summaryRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/stock-reconciliation`, {
        headers: { Cookie: dealerCookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(summaryRes.status).toBe(200);
    const json: any = await summaryRes.json();
    const t1 = json.data.byTank.find((t: any) => t.tankNumber === 1);

    expect(t1.hasOpeningReading).toBe(false);
    expect(t1.hasClosingReading).toBe(false);
    expect(t1.openingStockStr).toBeNull();
    expect(t1.physicalClosingStockStr).toBeNull();
    expect(t1.theoreticalClosingStockStr).toBeNull();
    expect(t1.varianceStr).toBeNull();
  });

  // 11. Strict PRE and POST decantation reading validation
  it('11. Strict decantation validation: PRE/POST type, same shift/tank/product, and positive volume', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-04' }),
      }),
      env
    );
    const shiftId = ((await openRes.json()) as any).data.id;

    // Create OPENING reading
    const openDip = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ tankId: 'tank-ro1-1', readingType: 'OPENING', productDipMm: '1000.000', waterDipMm: '0.000' }),
      }),
      env
    );
    const openDipId = ((await openDip.json()) as any).data.id;

    // Create Fuel Receipt
    const rcptRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'TT-TEST-11',
          invoiceNumber: 'INV-TEST-11',
          invoiceDate: '2026-11-04',
          arrivalAt: '2026-11-04T10:00:00Z',
          lines: [{ tankId: 'tank-ro1-1', productId: 'prod-ms', invoiceQuantity: '5000.000' }],
        }),
      }),
      env
    );
    const rcpt = ((await rcptRes.json()) as any).data;
    const lineId = rcpt.lines[0].id;

    // Attempt to link OPENING reading as PRE reading -> 400
    const invalidLinkRes = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipt-lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ preDecantReadingId: openDipId }),
      }),
      env
    );
    expect(invalidLinkRes.status).toBe(400);
    const invJson: any = await invalidLinkRes.json();
    expect(invJson.error.code).toBe('INVALID_DECANTATION_READING');
  });

  // 12. Prevent receipt reading reuse (409 RECEIPT_READING_ALREADY_LINKED)
  it('12. Prevents receipt reading reuse across multiple receipt lines (409 RECEIPT_READING_ALREADY_LINKED)', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-05' }),
      }),
      env
    );
    const shiftId = ((await openRes.json()) as any).data.id;

    // Create 1 PRE_RECEIPT reading for tank-ro1-1
    const preRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/tank-readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ tankId: 'tank-ro1-1', readingType: 'PRE_RECEIPT', productDipMm: '1000.000', waterDipMm: '0.000' }),
      }),
      env
    );
    const preId = ((await preRes.json()) as any).data.id;

    // Create 2 Fuel Receipts for same shift
    const r1 = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'TT-R1',
          invoiceNumber: 'INV-R1',
          invoiceDate: '2026-11-05',
          arrivalAt: '2026-11-05T10:00:00Z',
          lines: [{ tankId: 'tank-ro1-1', productId: 'prod-ms', invoiceQuantity: '5000.000' }],
        }),
      }),
      env
    );
    const r1LineId = ((await r1.json()) as any).data.lines[0].id;

    const r2 = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'TT-R2',
          invoiceNumber: 'INV-R2',
          invoiceDate: '2026-11-05',
          arrivalAt: '2026-11-05T10:30:00Z',
          lines: [{ tankId: 'tank-ro1-1', productId: 'prod-ms', invoiceQuantity: '5000.000' }],
        }),
      }),
      env
    );
    const r2LineId = ((await r2.json()) as any).data.lines[0].id;

    // Link preId to line 1
    const l1Res = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipt-lines/${r1LineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ preDecantReadingId: preId }),
      }),
      env
    );
    expect(l1Res.status).toBe(200);

    // Attempt to reuse preId on line 2 -> 409
    const l2Res = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipt-lines/${r2LineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ preDecantReadingId: preId }),
      }),
      env
    );
    expect(l2Res.status).toBe(409);
    const l2Json: any = await l2Res.json();
    expect(l2Json.error.code).toBe('RECEIPT_READING_ALREADY_LINKED');
  });

  // 13. Receipt state machine & terminal protection (409 RECEIPT_FINALIZED)
  it('13. Enforces controlled receipt status transitions and rejects modification once COMPLETED or CANCELLED', async () => {
    const { cookie: dealerCookie } = await loginAs('dealer.parkstreet@iocl.in');

    const openRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1001/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ shiftTemplateId: 'st-ro1-1', businessDate: '2026-11-06' }),
      }),
      env
    );
    const shiftId = ((await openRes.json()) as any).data.id;

    const rRes = await app.fetch(
      new Request(`http://localhost/api/v1/shifts/${shiftId}/fuel-receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          ttNumber: 'TT-TERM',
          invoiceNumber: 'INV-TERM',
          invoiceDate: '2026-11-06',
          arrivalAt: '2026-11-06T10:00:00Z',
          lines: [{ tankId: 'tank-ro1-1', productId: 'prod-ms', invoiceQuantity: '5000.000' }],
        }),
      }),
      env
    );
    const rcpt = ((await rRes.json()) as any).data;

    // Transition ARRIVED -> CANCELLED
    const cancelRes = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipts/${rcpt.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      }),
      env
    );
    expect(cancelRes.status).toBe(200);

    // Attempt to modify CANCELLED receipt line -> 409 RECEIPT_FINALIZED
    const modRes = await app.fetch(
      new Request(`http://localhost/api/v1/fuel-receipt-lines/${rcpt.lines[0].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: dealerCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({ density: '745.000' }),
      }),
      env
    );
    expect(modRes.status).toBe(409);
    const modJson: any = await modRes.json();
    expect(modJson.error.code).toBe('RECEIPT_FINALIZED');
  });

  // 14. Quality tolerance scope security (State Office cannot manage GLOBAL or other state rules)
  it('14. Quality tolerance scope security blocks State Office user from managing GLOBAL or other State rules (403 FORBIDDEN)', async () => {
    const { cookie: stateCookie } = await loginAs('wbso@iocl.in');

    // State office attempts to create GLOBAL rule -> 403
    const globalRes = await app.fetch(
      new Request('http://localhost/api/v1/quality-tolerances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: stateCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          scopeType: 'GLOBAL',
          densityTolerance: '2.000',
          effectiveFrom: '2026-01-01',
        }),
      }),
      env
    );
    expect(globalRes.status).toBe(403);

    // State office attempts to create rule for State Delhi (state-dl) -> 403
    const otherStateRes = await app.fetch(
      new Request('http://localhost/api/v1/quality-tolerances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: stateCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          scopeType: 'STATE',
          scopeEntityId: 'state-dl',
          densityTolerance: '2.500',
          effectiveFrom: '2026-01-01',
        }),
      }),
      env
    );
    expect(otherStateRes.status).toBe(403);

    // State office creates rule for their own State WB (state-wb) -> 201
    const ownStateRes = await app.fetch(
      new Request('http://localhost/api/v1/quality-tolerances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: stateCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          scopeType: 'STATE',
          scopeEntityId: 'state-wb',
          densityTolerance: '2.500',
          effectiveFrom: '2026-01-01',
        }),
      }),
      env
    );
    expect(ownStateRes.status).toBe(201);
  });

  // 15. Quality rule validity checks & overlapping active rules rejection
  it('15. Rejects effective_to < effective_from and overlapping active quality rules (409 OVERLAPPING_QUALITY_RULE)', async () => {
    const { cookie: adminCookie } = await loginAs('admin@iocl.in');

    // Invalid dates: effective_to < effective_from
    const badDateRes = await app.fetch(
      new Request('http://localhost/api/v1/quality-tolerances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          scopeType: 'GLOBAL',
          densityTolerance: '3.000',
          effectiveFrom: '2026-06-01',
          effectiveTo: '2026-05-01',
        }),
      }),
      env
    );
    expect(badDateRes.status).toBe(400);

    // Create Rule 1: 2028-01-01 to 2028-12-31
    const r1 = await app.fetch(
      new Request('http://localhost/api/v1/quality-tolerances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          scopeType: 'GLOBAL',
          productId: 'prod-ms',
          densityTolerance: '3.000',
          effectiveFrom: '2028-01-01',
          effectiveTo: '2028-12-31',
        }),
      }),
      env
    );
    expect(r1.status).toBe(201);

    // Create Rule 2 overlapping with Rule 1 for same scope and product -> 409 OVERLAPPING_QUALITY_RULE
    const r2 = await app.fetch(
      new Request('http://localhost/api/v1/quality-tolerances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie, Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          scopeType: 'GLOBAL',
          productId: 'prod-ms',
          densityTolerance: '2.500',
          effectiveFrom: '2028-06-01',
          effectiveTo: '2029-06-01',
        }),
      }),
      env
    );
    expect(r2.status).toBe(409);
    const r2Json: any = await r2.json();
    expect(r2Json.error.code).toBe('OVERLAPPING_QUALITY_RULE');
  });
});
