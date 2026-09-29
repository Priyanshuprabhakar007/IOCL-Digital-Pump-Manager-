import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, sql, asc } from 'drizzle-orm';
import { CngShiftLog, CngPressureReading } from '../../shared/types';

export class CngRepository {
  constructor(private db: AppDatabase) {}

  async isCngAvailableAtOutlet(outletId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.outletProducts.id })
      .from(schema.outletProducts)
      .innerJoin(schema.products, eq(schema.outletProducts.productId, schema.products.id))
      .where(
        and(
          eq(schema.outletProducts.outletId, outletId),
          eq(schema.outletProducts.status, 'ACTIVE'),
          eq(schema.products.status, 'ACTIVE'),
          eq(schema.products.category, 'CNG'),
          eq(schema.products.unit, 'KG')
        )
      )
      .limit(1);
    return !!row;
  }

  async findShiftLog(shiftId: string): Promise<CngShiftLog | null> {
    const [row] = await this.db
      .select()
      .from(schema.cngShiftLogs)
      .where(eq(schema.cngShiftLogs.operationalShiftId, shiftId));
    return (row as unknown as CngShiftLog) || null;
  }

  async upsertShiftLog(data: any): Promise<{ success: boolean; log: CngShiftLog | null; shiftClosed: boolean }> {
    const { operationalShiftId } = data;
    
    const existing = await this.findShiftLog(operationalShiftId);
    
    if (existing) {
      const updated = await this.db.all<{ id: string }>(
        sql`UPDATE cng_shift_logs
            SET
                mfm_opening_kg_milliunits = ${data.mfmOpeningKgMilliunits},
                mfm_closing_kg_milliunits = ${data.mfmClosingKgMilliunits},
                net_sales_kg_milliunits = ${data.netSalesKgMilliunits},
                grid_intake_kg_milliunits = ${data.gridIntakeKgMilliunits},
                grid_sales_variance_kg_milliunits = ${data.gridSalesVarianceKgMilliunits},
                recorded_by_user_id = ${data.recordedByUserId},
                notes = ${data.notes},
                updated_at = ${data.updatedAt}
            WHERE operational_shift_id = ${operationalShiftId}
            AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${operationalShiftId} AND status = 'OPEN')
            RETURNING id`
      );
      if (!updated || updated.length === 0) {
        return { success: false, log: null, shiftClosed: true };
      }
    } else {
      const inserted = await this.db.all<{ id: string }>(
        sql`INSERT INTO cng_shift_logs (
            id, operational_shift_id, outlet_id, 
            mfm_opening_kg_milliunits, mfm_closing_kg_milliunits, net_sales_kg_milliunits,
            grid_intake_kg_milliunits, grid_sales_variance_kg_milliunits,
            recorded_by_user_id, notes, created_at, updated_at
        )
        SELECT
            ${data.id}, ${data.operationalShiftId}, ${data.outletId},
            ${data.mfmOpeningKgMilliunits}, ${data.mfmClosingKgMilliunits}, ${data.netSalesKgMilliunits},
            ${data.gridIntakeKgMilliunits}, ${data.gridSalesVarianceKgMilliunits},
            ${data.recordedByUserId}, ${data.notes}, ${data.createdAt}, ${data.updatedAt}
        WHERE EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${operationalShiftId} AND status = 'OPEN')
        RETURNING id`
      );
      if (!inserted || inserted.length === 0) {
        return { success: false, log: null, shiftClosed: true };
      }
    }

    const log = await this.findShiftLog(operationalShiftId);
    return { success: true, log, shiftClosed: false };
  }

  async listPressureReadings(shiftId: string): Promise<CngPressureReading[]> {
    return this.db
      .select()
      .from(schema.cngPressureReadings)
      .where(eq(schema.cngPressureReadings.operationalShiftId, shiftId))
      .orderBy(asc(schema.cngPressureReadings.recordedAt)) as unknown as Promise<CngPressureReading[]>;
  }

  async findPressureReadingById(id: string): Promise<CngPressureReading | null> {
    const [row] = await this.db
      .select()
      .from(schema.cngPressureReadings)
      .where(eq(schema.cngPressureReadings.id, id));
    return (row as unknown as CngPressureReading) || null;
  }

  async createPressureReading(data: any): Promise<{ success: boolean; reading: CngPressureReading | null; shiftClosed: boolean }> {
    const inserted = await this.db.all<{ id: string }>(
      sql`INSERT INTO cng_pressure_readings (
          id, operational_shift_id, outlet_id, recorded_at, pressure_unit,
          suction_pressure_milliunits, discharge_pressure_milliunits, cascade_pressure_milliunits,
          recorded_by_user_id, notes, created_at, updated_at
      )
      SELECT
          ${data.id}, ${data.operationalShiftId}, ${data.outletId}, ${data.recordedAt}, ${data.pressureUnit},
          ${data.suctionPressureMilliunits}, ${data.dischargePressureMilliunits}, ${data.cascadePressureMilliunits},
          ${data.recordedByUserId}, ${data.notes}, ${data.createdAt}, ${data.updatedAt}
      WHERE EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${data.operationalShiftId} AND status = 'OPEN')
      RETURNING id`
    );

    if (!inserted || inserted.length === 0) {
      return { success: false, reading: null, shiftClosed: true };
    }

    const reading = await this.findPressureReadingById(data.id);
    return { success: true, reading, shiftClosed: false };
  }

  async updatePressureReading(id: string, data: any): Promise<{ success: boolean; reading: CngPressureReading | null; shiftClosed: boolean }> {
    const updated = await this.db.all<{ id: string }>(
      sql`UPDATE cng_pressure_readings
          SET
              recorded_at = ${data.recordedAt},
              pressure_unit = ${data.pressureUnit},
              suction_pressure_milliunits = ${data.suctionPressureMilliunits},
              discharge_pressure_milliunits = ${data.dischargePressureMilliunits},
              cascade_pressure_milliunits = ${data.cascadePressureMilliunits},
              notes = ${data.notes},
              updated_at = ${data.updatedAt}
          WHERE id = ${id}
          AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = cng_pressure_readings.operational_shift_id AND status = 'OPEN')
          RETURNING id`
    );

    if (!updated || updated.length === 0) {
      const existing = await this.findPressureReadingById(id);
      if (!existing) return { success: false, reading: null, shiftClosed: false };
      return { success: false, reading: null, shiftClosed: true };
    }

    const reading = await this.findPressureReadingById(id);
    return { success: true, reading, shiftClosed: false };
  }

  async deletePressureReading(id: string): Promise<{ success: boolean; reason?: 'NOT_FOUND' | 'SHIFT_CLOSED' }> {
    const deleted = await this.db.all<{ id: string }>(
      sql`DELETE FROM cng_pressure_readings
          WHERE id = ${id}
          AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = cng_pressure_readings.operational_shift_id AND status = 'OPEN')
          RETURNING id`
    );

    if (deleted && deleted.length > 0) {
      return { success: true };
    }

    const existing = await this.findPressureReadingById(id);
    if (!existing) return { success: false, reason: 'NOT_FOUND' };
    return { success: false, reason: 'SHIFT_CLOSED' };
  }

  async getDailySummaryRaw(outletId: string, businessDate: string): Promise<any[]> {
    return this.db
      .select({
        operationalShiftId: schema.cngShiftLogs.operationalShiftId,
        mfmOpeningKgMilliunits: schema.cngShiftLogs.mfmOpeningKgMilliunits,
        mfmClosingKgMilliunits: schema.cngShiftLogs.mfmClosingKgMilliunits,
        netSalesKgMilliunits: schema.cngShiftLogs.netSalesKgMilliunits,
        gridIntakeKgMilliunits: schema.cngShiftLogs.gridIntakeKgMilliunits,
        gridSalesVarianceKgMilliunits: schema.cngShiftLogs.gridSalesVarianceKgMilliunits,
      })
      .from(schema.cngShiftLogs)
      .innerJoin(schema.operationalShifts, eq(schema.cngShiftLogs.operationalShiftId, schema.operationalShifts.id))
      .where(
        and(
          eq(schema.cngShiftLogs.outletId, outletId),
          eq(schema.operationalShifts.businessDate, businessDate)
        )
      );
  }
}
