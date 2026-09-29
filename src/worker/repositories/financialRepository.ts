import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, sql, gte, lte, desc, asc } from 'drizzle-orm';
import { 
  ProductPrice, 
  CreditParty, 
  ShiftCollection, 
  CashHandover, 
  BankDeposit,
  OperationalShiftProductPrice,
  ShiftFinancialReconciliation
} from '../../shared/types';

export class FinancialRepository {
  constructor(private db: AppDatabase) {}

  // ==========================================
  // PRODUCT PRICES
  // ==========================================

  async listProductPrices(outletId: string): Promise<ProductPrice[]> {
    return this.db
      .select()
      .from(schema.outletProductPrices)
      .where(eq(schema.outletProductPrices.outletId, outletId))
      .orderBy(desc(schema.outletProductPrices.effectiveFrom)) as unknown as Promise<ProductPrice[]>;
  }

  async findProductPriceById(id: string): Promise<ProductPrice | null> {
    const [row] = await this.db
      .select()
      .from(schema.outletProductPrices)
      .where(eq(schema.outletProductPrices.id, id));
    return (row as unknown as ProductPrice) || null;
  }

  async findActivePriceForProduct(outletId: string, productId: string, date: string): Promise<ProductPrice | null> {
    const [row] = await this.db
      .select()
      .from(schema.outletProductPrices)
      .where(
        and(
          eq(schema.outletProductPrices.outletId, outletId),
          eq(schema.outletProductPrices.productId, productId),
          eq(schema.outletProductPrices.status, 'ACTIVE'),
          lte(schema.outletProductPrices.effectiveFrom, date),
          sql`(${schema.outletProductPrices.effectiveTo} IS NULL OR ${schema.outletProductPrices.effectiveTo} >= ${date})`
        )
      )
      .orderBy(desc(schema.outletProductPrices.effectiveFrom))
      .limit(1);
    return (row as unknown as ProductPrice) || null;
  }

  async checkPriceOverlap(outletId: string, productId: string, effectiveFrom: string, effectiveTo: string | null, excludeId?: string): Promise<boolean> {
    const conditions = [
      eq(schema.outletProductPrices.outletId, outletId),
      eq(schema.outletProductPrices.productId, productId),
      eq(schema.outletProductPrices.status, 'ACTIVE'),
    ];

    if (excludeId) {
      conditions.push(sql`${schema.outletProductPrices.id} != ${excludeId}`);
    }

    const rows = await this.db
      .select()
      .from(schema.outletProductPrices)
      .where(and(...conditions));

    return rows.some(r => {
      const start = r.effectiveFrom;
      const end = r.effectiveTo || '9999-12-31';
      const newStart = effectiveFrom;
      const newEnd = effectiveTo || '9999-12-31';

      return (newStart <= end && newEnd >= start);
    });
  }

  async createProductPrice(data: any): Promise<ProductPrice> {
    await this.db.insert(schema.outletProductPrices).values(data);
    return (await this.findProductPriceById(data.id))!;
  }

  async updateProductPrice(id: string, data: any): Promise<ProductPrice> {
    await this.db.update(schema.outletProductPrices).set(data).where(eq(schema.outletProductPrices.id, id));
    return (await this.findProductPriceById(id))!;
  }

  // ==========================================
  // CREDIT PARTIES
  // ==========================================

  async listCreditParties(outletId: string): Promise<CreditParty[]> {
    return this.db
      .select()
      .from(schema.creditParties)
      .where(eq(schema.creditParties.outletId, outletId))
      .orderBy(asc(schema.creditParties.partyName)) as unknown as Promise<CreditParty[]>;
  }

  async findCreditPartyById(id: string): Promise<CreditParty | null> {
    const [row] = await this.db
      .select()
      .from(schema.creditParties)
      .where(eq(schema.creditParties.id, id));
    return (row as unknown as CreditParty) || null;
  }

  async findCreditPartyByCode(outletId: string, partyCode: string): Promise<CreditParty | null> {
    const [row] = await this.db
      .select()
      .from(schema.creditParties)
      .where(and(eq(schema.creditParties.outletId, outletId), eq(schema.creditParties.partyCode, partyCode)));
    return (row as unknown as CreditParty) || null;
  }

  async createCreditParty(data: any): Promise<CreditParty> {
    await this.db.insert(schema.creditParties).values(data);
    return (await this.findCreditPartyById(data.id))!;
  }

  async updateCreditParty(id: string, data: any): Promise<CreditParty> {
    await this.db.update(schema.creditParties).set(data).where(eq(schema.creditParties.id, id));
    return (await this.findCreditPartyById(id))!;
  }

  // ==========================================
  // COLLECTIONS
  // ==========================================

  async listCollections(shiftId: string): Promise<ShiftCollection[]> {
    return this.db
      .select()
      .from(schema.shiftCollections)
      .where(eq(schema.shiftCollections.operationalShiftId, shiftId))
      .orderBy(asc(schema.shiftCollections.collectedAt)) as unknown as Promise<ShiftCollection[]>;
  }

  async findCollectionById(id: string): Promise<ShiftCollection | null> {
    const [row] = await this.db
      .select()
      .from(schema.shiftCollections)
      .where(eq(schema.shiftCollections.id, id));
    return (row as unknown as ShiftCollection) || null;
  }

  async createCollection(data: any): Promise<{ collection: ShiftCollection | null; shiftClosed: boolean }> {
    const inserted = await this.db.all<{ id: string }>(
      sql`INSERT INTO shift_collections (
        id, operational_shift_id, outlet_id, collection_type, amount_paise,
        provider, reference_number, credit_party_id, credit_party_code_snapshot, credit_party_name_snapshot,
        collected_at, recorded_by_user_id, notes, created_at, updated_at
      )
      SELECT
        ${data.id}, ${data.operationalShiftId}, ${data.outletId}, ${data.collectionType}, ${data.amountPaise},
        ${data.provider}, ${data.referenceNumber}, ${data.creditPartyId}, ${data.creditPartyCodeSnapshot}, ${data.creditPartyNameSnapshot},
        ${data.collectedAt}, ${data.recordedByUserId}, ${data.notes}, ${data.createdAt}, ${data.updatedAt}
      WHERE EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${data.operationalShiftId} AND status = 'OPEN')
      RETURNING id`
    );

    if (!inserted || inserted.length === 0) {
      return { collection: null, shiftClosed: true };
    }

    const col = await this.findCollectionById(data.id);
    return { collection: col, shiftClosed: false };
  }

  async updateCollection(id: string, data: any): Promise<{ collection: ShiftCollection | null; shiftClosed: boolean }> {
    const updated = await this.db.all<{ id: string }>(
      sql`UPDATE shift_collections
          SET
            collection_type = ${data.collectionType},
            amount_paise = ${data.amountPaise},
            provider = ${data.provider},
            reference_number = ${data.referenceNumber},
            credit_party_id = ${data.creditPartyId},
            credit_party_code_snapshot = ${data.creditPartyCodeSnapshot},
            credit_party_name_snapshot = ${data.creditPartyNameSnapshot},
            collected_at = ${data.collectedAt},
            notes = ${data.notes},
            updated_at = ${data.updatedAt}
          WHERE id = ${id}
            AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = shift_collections.operational_shift_id AND status = 'OPEN')
          RETURNING id`
    );

    if (!updated || updated.length === 0) {
      return { collection: null, shiftClosed: true };
    }

    const col = await this.findCollectionById(id);
    return { collection: col, shiftClosed: false };
  }

  async deleteCollection(id: string): Promise<{ success: boolean; reason?: 'NOT_FOUND' | 'SHIFT_CLOSED' }> {
    const deleted = await this.db.all<{ id: string }>(
      sql`DELETE FROM shift_collections
          WHERE id = ${id}
            AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = shift_collections.operational_shift_id AND status = 'OPEN')
          RETURNING id`
    );

    if (deleted && deleted.length > 0) {
      return { success: true };
    }

    // It was not deleted, either it doesn't exist or shift is closed
    const col = await this.findCollectionById(id);
    if (!col) {
      return { success: false, reason: 'NOT_FOUND' };
    }
    
    return { success: false, reason: 'SHIFT_CLOSED' };
  }

  // ==========================================
  // CASH HANDOVERS
  // ==========================================

  async listCashHandovers(shiftId: string): Promise<CashHandover[]> {
    return this.db
      .select()
      .from(schema.cashHandoverLogs)
      .where(eq(schema.cashHandoverLogs.operationalShiftId, shiftId))
      .orderBy(asc(schema.cashHandoverLogs.handedOverAt)) as unknown as Promise<CashHandover[]>;
  }

  async findCashHandoverById(id: string): Promise<CashHandover | null> {
    const [row] = await this.db
      .select()
      .from(schema.cashHandoverLogs)
      .where(eq(schema.cashHandoverLogs.id, id));
    return (row as unknown as CashHandover) || null;
  }

  async createCashHandover(data: any): Promise<{ handover: CashHandover | null; shiftClosed: boolean }> {
    const inserted = await this.db.all<{ id: string }>(
      sql`INSERT INTO cash_handover_logs (
        id, operational_shift_id, outlet_id, amount_paise,
        handed_over_by_user_id, handed_over_at, status, notes, created_at, updated_at
      )
      SELECT
        ${data.id}, ${data.operationalShiftId}, ${data.outletId}, ${data.amountPaise},
        ${data.handedOverByUserId}, ${data.handedOverAt}, 'PENDING', ${data.notes}, ${data.createdAt}, ${data.updatedAt}
      WHERE EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${data.operationalShiftId} AND status = 'OPEN')
      RETURNING id`
    );

    if (!inserted || inserted.length === 0) {
      return { handover: null, shiftClosed: true };
    }

    const ho = await this.findCashHandoverById(data.id);
    return { handover: ho, shiftClosed: false };
  }

  async updateCashHandoverStatus(id: string, data: any): Promise<CashHandover> {
    await this.db.update(schema.cashHandoverLogs).set(data).where(eq(schema.cashHandoverLogs.id, id));
    return (await this.findCashHandoverById(id))!;
  }

  async updateCashHandoverStatusConditional(id: string, data: any): Promise<CashHandover | null> {
    const res = await this.db.all<{ id: string }>(
      sql`UPDATE cash_handover_logs
          SET status = ${data.status},
              received_by_user_id = ${data.receivedByUserId || null},
              received_at = ${data.receivedAt || null},
              updated_at = ${data.updatedAt}
          WHERE id = ${id} AND status = 'PENDING'
          RETURNING id`
    );
    if (!res || res.length === 0) return null;
    return this.findCashHandoverById(id);
  }

  // ==========================================
  // BANK DEPOSITS
  // ==========================================

  async listBankDeposits(shiftId: string): Promise<BankDeposit[]> {
    return this.db
      .select()
      .from(schema.bankDeposits)
      .where(eq(schema.bankDeposits.operationalShiftId, shiftId))
      .orderBy(asc(schema.bankDeposits.depositDate)) as unknown as Promise<BankDeposit[]>;
  }

  async findBankDepositById(id: string): Promise<BankDeposit | null> {
    const [row] = await this.db
      .select()
      .from(schema.bankDeposits)
      .where(eq(schema.bankDeposits.id, id));
    return (row as unknown as BankDeposit) || null;
  }

  async createBankDeposit(data: any): Promise<BankDeposit> {
    await this.db.insert(schema.bankDeposits).values(data);
    return (await this.findBankDepositById(data.id))!;
  }

  async updateBankDepositStatus(id: string, data: any): Promise<BankDeposit> {
    await this.db.update(schema.bankDeposits).set(data).where(eq(schema.bankDeposits.id, id));
    return (await this.findBankDepositById(id))!;
  }

  async updateBankDepositStatusConditional(id: string, data: any): Promise<BankDeposit | null> {
    const res = await this.db.all<{ id: string }>(
      sql`UPDATE bank_deposits
          SET status = ${data.status},
              verified_by_user_id = ${data.verifiedByUserId || null},
              verified_at = ${data.verifiedAt || null},
              rejection_reason = ${data.rejectionReason || null},
              updated_at = ${data.updatedAt}
          WHERE id = ${id} AND status = 'SUBMITTED'
          RETURNING id`
    );
    if (!res || res.length === 0) return null;
    return this.findBankDepositById(id);
  }

  // ==========================================
  // SNAPSHOTS & RECONCILIATION
  // ==========================================

  async listShiftProductPrices(shiftId: string): Promise<OperationalShiftProductPrice[]> {
    return this.db
      .select()
      .from(schema.operationalShiftProductPrices)
      .where(eq(schema.operationalShiftProductPrices.operationalShiftId, shiftId)) as unknown as Promise<OperationalShiftProductPrice[]>;
  }

  async findShiftFinancialReconciliation(shiftId: string): Promise<ShiftFinancialReconciliation | null> {
    const [row] = await this.db
      .select()
      .from(schema.shiftFinancialReconciliations)
      .where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
    return (row as unknown as ShiftFinancialReconciliation) || null;
  }

  async createOrUpdateFinancialReconciliation(data: any): Promise<ShiftFinancialReconciliation> {
    const existing = await this.findShiftFinancialReconciliation(data.operationalShiftId);
    if (existing) {
      await this.db.update(schema.shiftFinancialReconciliations).set(data).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, data.operationalShiftId));
    } else {
      await this.db.insert(schema.shiftFinancialReconciliations).values(data);
    }
    return (await this.findShiftFinancialReconciliation(data.operationalShiftId))!;
  }

  async deleteFinancialReconciliation(shiftId: string): Promise<void> {
    await this.db.delete(schema.shiftFinancialReconciliations).where(eq(schema.shiftFinancialReconciliations.operationalShiftId, shiftId));
  }
}
