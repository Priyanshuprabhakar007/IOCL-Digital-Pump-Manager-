import { CngRepository } from '../repositories/cngRepository';
import { PumpRepository } from '../repositories/pumpRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { parseMilliunits, formatMilliunits } from '../../shared/precision';
import { CngShiftLog, CngPressureReading, CngDailySummary } from '../../shared/types';

export class CngService {
  constructor(
    private cngRepo: CngRepository,
    private pumpRepo: PumpRepository,
    private auditRepo: AuditRepository
  ) {}

  private formatShiftLog(log: any): CngShiftLog {
    return {
      ...log,
      mfmOpeningKg: formatMilliunits(log.mfmOpeningKgMilliunits),
      mfmClosingKg: formatMilliunits(log.mfmClosingKgMilliunits),
      netSalesKg: formatMilliunits(log.netSalesKgMilliunits),
      gridIntakeKg: log.gridIntakeKgMilliunits != null ? formatMilliunits(log.gridIntakeKgMilliunits) : null,
      gridSalesVarianceKg: log.gridSalesVarianceKgMilliunits != null ? formatMilliunits(log.gridSalesVarianceKgMilliunits) : null,
    };
  }

  private formatPressureReading(reading: any): CngPressureReading {
    return {
      ...reading,
      suctionPressure: reading.suctionPressureMilliunits != null ? formatMilliunits(reading.suctionPressureMilliunits) : null,
      dischargePressure: reading.dischargePressureMilliunits != null ? formatMilliunits(reading.dischargePressureMilliunits) : null,
      cascadePressure: reading.cascadePressureMilliunits != null ? formatMilliunits(reading.cascadePressureMilliunits) : null,
    };
  }

  async getShiftLog(shiftId: string): Promise<CngShiftLog | null> {
    const log = await this.cngRepo.findShiftLog(shiftId);
    return log ? this.formatShiftLog(log) : null;
  }

  async upsertShiftLog(shiftId: string, userId: string, data: any): Promise<{ success: boolean; log: CngShiftLog | null; error?: string }> {
    const shift = await this.pumpRepo.findOperationalShiftById(shiftId);
    if (!shift) return { success: false, log: null, error: 'SHIFT_NOT_FOUND' };

    const isAvailable = await this.cngRepo.isCngAvailableAtOutlet(shift.outletId);
    if (!isAvailable) return { success: false, log: null, error: 'CNG_NOT_AVAILABLE_AT_OUTLET' };

    const openingMilli = parseMilliunits(data.mfmOpeningKg);
    const closingMilli = parseMilliunits(data.mfmClosingKg);
    const netSalesMilli = closingMilli - openingMilli;

    let gridIntakeMilli: number | null = null;
    let gridVarianceMilli: number | null = null;

    if (data.gridIntakeKg != null) {
      gridIntakeMilli = parseMilliunits(data.gridIntakeKg);
      gridVarianceMilli = gridIntakeMilli - netSalesMilli;
    }

    const nowIso = new Date().toISOString();
    const existing = await this.cngRepo.findShiftLog(shiftId);

    const upsertData = {
      id: existing?.id || `cnglog-${crypto.randomUUID()}`,
      operationalShiftId: shiftId,
      outletId: shift.outletId,
      mfmOpeningKgMilliunits: openingMilli,
      mfmClosingKgMilliunits: closingMilli,
      netSalesKgMilliunits: netSalesMilli,
      gridIntakeKgMilliunits: gridIntakeMilli,
      gridSalesVarianceKgMilliunits: gridVarianceMilli,
      recordedByUserId: userId,
      notes: data.notes || null,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    const res = await this.cngRepo.upsertShiftLog(upsertData);
    if (!res.success) {
      if (res.shiftClosed) return { success: false, log: null, error: 'SHIFT_CLOSED' };
      return { success: false, log: null, error: 'UPSERT_FAILED' };
    }

    const formatted = this.formatShiftLog(res.log!);

    await this.auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId,
      action: existing ? 'CNG_SHIFT_LOG_UPDATE' : 'CNG_SHIFT_LOG_CREATE',
      entityType: 'CNG_SHIFT_LOG',
      entityId: formatted.id,
      oldValue: existing ? this.formatShiftLog(existing) as unknown as Record<string, unknown> : null,
      newValue: formatted as unknown as Record<string, unknown>,
      createdAt: nowIso,
    });

    return { success: true, log: formatted };
  }

  async listPressureReadings(shiftId: string): Promise<CngPressureReading[]> {
    const readings = await this.cngRepo.listPressureReadings(shiftId);
    return readings.map(r => this.formatPressureReading(r));
  }

  async createPressureReading(shiftId: string, userId: string, data: any): Promise<{ success: boolean; reading: CngPressureReading | null; error?: string }> {
    const shift = await this.pumpRepo.findOperationalShiftById(shiftId);
    if (!shift) return { success: false, reading: null, error: 'SHIFT_NOT_FOUND' };

    const isAvailable = await this.cngRepo.isCngAvailableAtOutlet(shift.outletId);
    if (!isAvailable) return { success: false, reading: null, error: 'CNG_NOT_AVAILABLE_AT_OUTLET' };

    const nowIso = new Date().toISOString();
    const insertData = {
      id: `cngpr-${crypto.randomUUID()}`,
      operationalShiftId: shiftId,
      outletId: shift.outletId,
      recordedAt: data.recordedAt,
      pressureUnit: data.pressureUnit,
      suctionPressureMilliunits: data.suctionPressure != null ? parseMilliunits(data.suctionPressure) : null,
      dischargePressureMilliunits: data.dischargePressure != null ? parseMilliunits(data.dischargePressure) : null,
      cascadePressureMilliunits: data.cascadePressure != null ? parseMilliunits(data.cascadePressure) : null,
      recordedByUserId: userId,
      notes: data.notes || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const res = await this.cngRepo.createPressureReading(insertData);
    if (!res.success) {
      if (res.shiftClosed) return { success: false, reading: null, error: 'SHIFT_CLOSED' };
      return { success: false, reading: null, error: 'CREATE_FAILED' };
    }

    const formatted = this.formatPressureReading(res.reading!);

    await this.auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId,
      action: 'CNG_PRESSURE_READING_CREATE',
      entityType: 'CNG_PRESSURE_READING',
      entityId: formatted.id,
      newValue: formatted as unknown as Record<string, unknown>,
      createdAt: nowIso,
    });

    return { success: true, reading: formatted };
  }

  async updatePressureReading(id: string, userId: string, data: any): Promise<{ success: boolean; reading: CngPressureReading | null; error?: string }> {
    const existing = await this.cngRepo.findPressureReadingById(id);
    if (!existing) return { success: false, reading: null, error: 'NOT_FOUND' };

    const isAvailable = await this.cngRepo.isCngAvailableAtOutlet(existing.outletId);
    if (!isAvailable) return { success: false, reading: null, error: 'CNG_NOT_AVAILABLE_AT_OUTLET' };

    const nowIso = new Date().toISOString();
    const updateData = {
      recordedAt: data.recordedAt,
      pressureUnit: data.pressureUnit,
      suctionPressureMilliunits: data.suctionPressure != null ? parseMilliunits(data.suctionPressure) : null,
      dischargePressureMilliunits: data.dischargePressure != null ? parseMilliunits(data.dischargePressure) : null,
      cascadePressureMilliunits: data.cascadePressure != null ? parseMilliunits(data.cascadePressure) : null,
      notes: data.notes || null,
      updatedAt: nowIso,
    };

    const res = await this.cngRepo.updatePressureReading(id, updateData);
    if (!res.success) {
      if (res.reason === 'SHIFT_CLOSED') return { success: false, reading: null, error: 'SHIFT_CLOSED' };
      if (res.reason === 'NOT_FOUND') return { success: false, reading: null, error: 'NOT_FOUND' };
      return { success: false, reading: null, error: 'UPDATE_FAILED' };
    }

    const formatted = this.formatPressureReading(res.reading!);

    await this.auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId,
      action: 'CNG_PRESSURE_READING_UPDATE',
      entityType: 'CNG_PRESSURE_READING',
      entityId: formatted.id,
      oldValue: this.formatPressureReading(existing) as unknown as Record<string, unknown>,
      newValue: formatted as unknown as Record<string, unknown>,
      createdAt: nowIso,
    });

    return { success: true, reading: formatted };
  }

  async deletePressureReading(id: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const existing = await this.cngRepo.findPressureReadingById(id);
    if (!existing) return { success: false, error: 'NOT_FOUND' };

    const isAvailable = await this.cngRepo.isCngAvailableAtOutlet(existing.outletId);
    if (!isAvailable) return { success: false, error: 'CNG_NOT_AVAILABLE_AT_OUTLET' };

    const res = await this.cngRepo.deletePressureReading(id);
    if (!res.success) {
      if (res.reason === 'SHIFT_CLOSED') return { success: false, error: 'SHIFT_CLOSED' };
      if (res.reason === 'NOT_FOUND') return { success: false, error: 'NOT_FOUND' };
      return { success: false, error: 'DELETE_FAILED' };
    }

    await this.auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId,
      action: 'CNG_PRESSURE_READING_DELETE',
      entityType: 'CNG_PRESSURE_READING',
      entityId: id,
      oldValue: this.formatPressureReading(existing) as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    });

    return { success: true };
  }

  async getDailySummary(outletId: string, businessDate: string): Promise<CngDailySummary> {
    const logs = await this.cngRepo.getDailySummaryRaw(outletId, businessDate);
    
    let totalSalesMilli = 0;
    let totalGridMilli = 0;
    let anyShiftHasGrid = false;
    let allShiftsHaveGrid = true;

    if (logs.length === 0) {
      allShiftsHaveGrid = false;
    }

    for (const log of logs) {
      totalSalesMilli += log.netSalesKgMilliunits;
      if (log.gridIntakeKgMilliunits != null) {
        totalGridMilli += log.gridIntakeKgMilliunits;
        anyShiftHasGrid = true;
      } else {
        allShiftsHaveGrid = false;
      }
    }

    const gridIntakeKgMilliunits = anyShiftHasGrid ? totalGridMilli : null;
    const gridSalesVarianceKgMilliunits = allShiftsHaveGrid ? totalGridMilli - totalSalesMilli : null;

    return {
      outletId,
      businessDate,
      totalMfmSalesKgMilliunits: totalSalesMilli,
      totalMfmSalesKg: formatMilliunits(totalSalesMilli),
      gridIntakeKgMilliunits,
      gridIntakeKg: gridIntakeKgMilliunits != null ? formatMilliunits(gridIntakeKgMilliunits) : null,
      gridSalesVarianceKgMilliunits,
      gridSalesVarianceKg: gridSalesVarianceKgMilliunits != null ? formatMilliunits(gridSalesVarianceKgMilliunits) : null,
      shiftCount: logs.length,
      gridDataComplete: allShiftsHaveGrid
    };
  }
}
