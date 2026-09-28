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

    // 6. Complete receipt status
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
          effectiveFrom: '2026-01-01',
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
});
