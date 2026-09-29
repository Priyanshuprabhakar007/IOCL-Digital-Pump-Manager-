import { PumpRepository } from '../repositories/pumpRepository';
import { FinancialRepository } from '../repositories/financialRepository';
import { FinancialService } from './financialService';
import { AuditRepository } from '../repositories/auditRepository';
import { OperationalShift, ShiftFinancialReconciliation } from '../../shared/types';

export class ShiftCloseService {
  constructor(
    private pumpRepo: PumpRepository,
    private financialRepo: FinancialRepository,
    private financialService: FinancialService,
    private auditRepo: AuditRepository
  ) {}

  async closeShift(
    shiftId: string,
    closedByUserId: string,
    varianceReason?: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<{ success: boolean; shift: OperationalShift | null; error?: string; message?: string; details?: any }> {
    const nowIso = new Date().toISOString();

    // 1. Atomically claim shift: OPEN -> CLOSING
    const beginRes = await this.pumpRepo.beginCloseConditional(shiftId);
    if (!beginRes.success || !beginRes.shift) {
      return {
        success: false,
        shift: beginRes.shift,
        error: 'SHIFT_CLOSED_OR_CLOSING',
        message: 'Shift is already closing, closed, or locked',
      };
    }

    const shift = beginRes.shift;

    // Helper to abort and restore OPEN, ensuring no stale reconciliation
    const abortAndRestore = async (errorCode: string, message: string, details?: any) => {
      await this.pumpRepo.restoreOpenFromClosing(shiftId);
      // Clean up any authoritative reconciliation created during the failed attempt
      await this.financialRepo.deleteFinancialReconciliation(shiftId);
      await this.pumpRepo.deleteStockReconciliation(shiftId);
      return {
        success: false,
        shift: await this.pumpRepo.findOperationalShiftById(shiftId),
        error: errorCode,
        message,
        details,
      };
    };

    // 2. Validate tank/receipt completeness
    const tankCheck = await this.pumpRepo.validateShiftCompleteness(shiftId);
    if (!tankCheck.valid) {
      return abortAndRestore(
        tankCheck.error || 'INCOMPLETE_TANK_STOCK_DATA',
        tankCheck.message || 'Tank stock data is incomplete',
        tankCheck.details || null
      );
    }

    // 3. Validate meter/nozzle completeness
    const snapshots = await this.pumpRepo.listShiftNozzleSnapshots(shiftId);
    const readings = await this.pumpRepo.listReadingsForShift(shiftId);
    const unavails = await this.pumpRepo.listUnavailabilityForShift(shiftId);

    const coveredNozzleIds = new Set<string>();
    readings.forEach(r => coveredNozzleIds.add(r.nozzleId));
    unavails.forEach(u => coveredNozzleIds.add(u.nozzleId));

    const missingSnapshots = snapshots.filter(s => !coveredNozzleIds.has(s.nozzleId));
    if (missingSnapshots.length > 0) {
      const missingDescriptions = missingSnapshots.map(
        s => `Dispenser #${s.dispenserNumber} - Nozzle #${s.nozzleNumber} (${s.productName || s.productCode})`
      );
      return abortAndRestore(
        'INCOMPLETE_SHIFT_READINGS',
        `Cannot close shift. ${missingSnapshots.length} active nozzle(s) have neither a meter reading nor an approved unavailability record.`,
        { missingCount: missingSnapshots.length, missingNozzles: missingDescriptions }
      );
    }

    // 4. Calculate/persist stock reconciliation
    try {
      await this.pumpRepo.calculateAndSaveShiftStockReconciliation(shiftId);
    } catch (err: any) {
      return abortAndRestore(
        err?.code || 'RECONCILIATION_FAILED',
        err?.message || 'Failed to compute stock reconciliation'
      );
    }

    // 5. Calculate/persist financial reconciliation (enforcing variance reason & price snapshots & overflow)
    try {
      await this.financialService.performFinancialReconciliation(shiftId, varianceReason, true);
    } catch (err: any) {
      const msg = err?.message || err;
      if (msg === 'VARIANCE_REASON_REQUIRED') {
        return abortAndRestore('VARIANCE_REASON_REQUIRED', 'Non-zero variance requires a reason');
      }
      if (msg === 'FINANCIAL_PRICE_SNAPSHOT_UNAVAILABLE') {
        return abortAndRestore('PRICE_SNAPSHOT_MISSING', 'Historical price snapshot unavailable');
      }
      if (msg === 'FINANCIAL_AMOUNT_OVERFLOW') {
        return abortAndRestore('FINANCIAL_AMOUNT_OVERFLOW', 'Financial amount overflow');
      }
      return abortAndRestore('FINANCIAL_RECONCILIATION_FAILED', typeof msg === 'string' ? msg : 'Financial reconciliation failed');
    }

    // 6. Final transition: CLOSING -> CLOSED
    const finalizeRes = await this.pumpRepo.finalizeCloseConditional(shiftId, closedByUserId);
    if (!finalizeRes.success || !finalizeRes.shift) {
      await this.pumpRepo.restoreOpenFromClosing(shiftId);
      await this.financialRepo.deleteFinancialReconciliation(shiftId);
      await this.pumpRepo.deleteStockReconciliation(shiftId);
      return {
        success: false,
        shift: await this.pumpRepo.findOperationalShiftById(shiftId),
        error: 'SHIFT_CLOSED_OR_CLOSING',
        message: 'Shift was closed or modified concurrently',
      };
    }

    const closed = finalizeRes.shift;

    // Audit successful close and financial reconciliation
    const recon = await this.financialRepo.findShiftFinancialReconciliation(shiftId);

    await this.auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId: closedByUserId,
      action: 'SHIFT_CLOSE',
      entityType: 'OPERATIONAL_SHIFT',
      entityId: shiftId,
      oldValue: { status: shift.status },
      newValue: closed as unknown as Record<string, unknown>,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      createdAt: nowIso,
    });

    if (recon) {
      await this.auditRepo.logAction({
        id: `aud-${crypto.randomUUID()}`,
        userId: closedByUserId,
        action: 'FINANCIAL_RECONCILIATION',
        entityType: 'OPERATIONAL_SHIFT',
        entityId: shiftId,
        newValue: {
          fuelRevenuePaise: recon.fuelSalesRevenuePaise,
          totalCollectionsPaise: recon.totalCollectionsPaise,
          variancePaise: recon.salesCollectionVariancePaise,
          varianceStatus: recon.varianceStatus,
          varianceReason: recon.varianceReason,
        } as unknown as Record<string, unknown>,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        createdAt: nowIso,
      });
    }

    return { success: true, shift: closed };
  }
}
