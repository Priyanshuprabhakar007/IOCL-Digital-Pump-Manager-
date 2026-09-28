import { eq, and, or, isNull, lte, gte } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { AppDatabase } from '../../db';
import { QualityStatus } from '../../shared/types';

export class QualityToleranceService {
  /**
   * Resolves the most-specific active quality tolerance rule for a given outlet and product,
   * then computes the quality status ('PASS', 'OUT_OF_TOLERANCE', or 'NOT_EVALUATED').
   */
  static async evaluateDensityQuality(
    db: AppDatabase,
    outletId: string,
    productId: string,
    observedDensityMilliunits: number | null | undefined,
    invoiceDensityMilliunits: number | null | undefined,
    evalDate?: string | null
  ): Promise<{
    qualityStatus: QualityStatus;
    densityVarianceMilliunits: number | null;
    appliedToleranceMilliunits: number | null;
    appliedToleranceSettingId: string | null;
  }> {
    if (observedDensityMilliunits == null || invoiceDensityMilliunits == null) {
      return {
        qualityStatus: 'NOT_EVALUATED',
        densityVarianceMilliunits: null,
        appliedToleranceMilliunits: null,
        appliedToleranceSettingId: null,
      };
    }

    const densityVarianceMilliunits = observedDensityMilliunits - invoiceDensityMilliunits;

    // Resolve outlet hierarchy
    const [outlet] = await db.select().from(schema.retailOutlets).where(eq(schema.retailOutlets.id, outletId));
    if (!outlet) {
      return {
        qualityStatus: 'NOT_EVALUATED',
        densityVarianceMilliunits,
        appliedToleranceMilliunits: null,
        appliedToleranceSettingId: null,
      };
    }

    const dateStr = evalDate ? evalDate.split('T')[0] : new Date().toISOString().split('T')[0];

    // Fetch all active tolerance settings
    const activeRules = await db
      .select()
      .from(schema.qualityToleranceSettings)
      .where(
        and(
          eq(schema.qualityToleranceSettings.status, 'ACTIVE'),
          lte(schema.qualityToleranceSettings.effectiveFrom, dateStr),
          or(
            isNull(schema.qualityToleranceSettings.effectiveTo),
            gte(schema.qualityToleranceSettings.effectiveTo, dateStr)
          )
        )
      );

    // Hierarchical resolution priority:
    let matchedRule: typeof activeRules[0] | undefined;

    // 1 & 2: OUTLET
    matchedRule =
      activeRules.find((r: any) => r.scopeType === 'OUTLET' && r.scopeEntityId === outlet.id && r.productId === productId) ||
      activeRules.find((r: any) => r.scopeType === 'OUTLET' && r.scopeEntityId === outlet.id && !r.productId);

    // 3 & 4: DIVISION
    if (!matchedRule && outlet.divisionId) {
      matchedRule =
        activeRules.find((r: any) => r.scopeType === 'DIVISION' && r.scopeEntityId === outlet.divisionId && r.productId === productId) ||
        activeRules.find((r: any) => r.scopeType === 'DIVISION' && r.scopeEntityId === outlet.divisionId && !r.productId);
    }

    // 5 & 6: STATE
    if (!matchedRule && outlet.stateId) {
      matchedRule =
        activeRules.find((r: any) => r.scopeType === 'STATE' && r.scopeEntityId === outlet.stateId && r.productId === productId) ||
        activeRules.find((r: any) => r.scopeType === 'STATE' && r.scopeEntityId === outlet.stateId && !r.productId);
    }

    // 7 & 8: GLOBAL
    if (!matchedRule) {
      matchedRule =
        activeRules.find((r: any) => r.scopeType === 'GLOBAL' && r.productId === productId) ||
        activeRules.find((r: any) => r.scopeType === 'GLOBAL' && !r.productId);
    }

    if (!matchedRule) {
      return {
        qualityStatus: 'NOT_EVALUATED',
        densityVarianceMilliunits,
        appliedToleranceMilliunits: null,
        appliedToleranceSettingId: null,
      };
    }

    const absVariance = Math.abs(densityVarianceMilliunits);
    const pass = absVariance <= matchedRule.densityToleranceMilliunits;

    return {
      qualityStatus: pass ? 'PASS' : 'OUT_OF_TOLERANCE',
      densityVarianceMilliunits,
      appliedToleranceMilliunits: matchedRule.densityToleranceMilliunits,
      appliedToleranceSettingId: matchedRule.id,
    };
  }
}
