import { FinancialRepository } from '../repositories/financialRepository';
import { PumpRepository } from '../repositories/pumpRepository';
import { CngRepository } from '../repositories/cngRepository';
import { 
  ShiftFinancialSummary, 
  FinancialRevenueProduct, 
  FinancialVarianceStatus,
  ShiftFinancialReconciliation
} from '../../shared/types';
import { formatPaiseToMoney, calculateRevenuePaise } from '../../shared/financialUtils';
import { formatMilliunits } from '../../shared/precision';

export class FinancialService {
  constructor(
    private financialRepo: FinancialRepository,
    private pumpRepo: PumpRepository,
    private cngRepo: CngRepository
  ) {}

  async calculateShiftFuelRevenue(shiftId: string) {
    const shift = await this.pumpRepo.findOperationalShiftById(shiftId);
    if (!shift) throw new Error('SHIFT_NOT_FOUND');

    const nozzleSnapshots = await this.pumpRepo.listShiftNozzleSnapshots(shiftId);
    const meterReadings = await this.pumpRepo.listReadingsForShift(shiftId);
    const priceSnapshots = await this.financialRepo.listShiftProductPrices(shiftId);

    const priceMap = new Map<string, number>();
    priceSnapshots.filter(p => p.productCategory !== 'CNG').forEach(p => priceMap.set(p.productId, p.pricePaisePerUnit));

    const readingMap = new Map<string, typeof meterReadings[0]>();
    meterReadings.forEach(r => readingMap.set(r.nozzleId, r));

    const productTotals = new Map<string, {
      productCode: string;
      productName: string;
      unit: string;
      quantityMilliunits: number;
      pricePaisePerUnit: number;
    }>();

    for (const nozzle of nozzleSnapshots) {
      const productId = nozzle.productId;
      const price = priceMap.get(productId);

      if (nozzle.productCategory === 'CNG') continue;

      if (price === undefined || price <= 0 || nozzle.productUnit !== 'LITRE') {
        throw new Error('FINANCIAL_PRICE_SNAPSHOT_UNAVAILABLE');
      }

      const reading = readingMap.get(nozzle.nozzleId);
      const netQuantity = reading?.netSalesQuantityMilliunits || 0;

      let pData = productTotals.get(productId);
      if (!pData) {
        pData = {
          productCode: nozzle.productCode,
          productName: nozzle.productName || '',
          unit: nozzle.productUnit,
          quantityMilliunits: 0,
          pricePaisePerUnit: price
        };
        productTotals.set(productId, pData);
      }
      pData.quantityMilliunits += netQuantity;
    }

    const byProduct: FinancialRevenueProduct[] = [];
    let fuelTotalPaise = 0;

    for (const [productId, data] of productTotals.entries()) {
      const revenuePaise = calculateRevenuePaise(data.quantityMilliunits, data.pricePaisePerUnit);

      byProduct.push({
        productId,
        productCode: data.productCode,
        productName: data.productName,
        unit: data.unit,
        quantityMilliunits: data.quantityMilliunits,
        quantityStr: formatMilliunits(data.quantityMilliunits),
        pricePaisePerUnit: data.pricePaisePerUnit,
        pricePerUnitStr: formatPaiseToMoney(data.pricePaisePerUnit),
        revenuePaise,
        revenueStr: formatPaiseToMoney(revenuePaise)
      });

      fuelTotalPaise += revenuePaise;
    }

    return {
      byProduct,
      fuelTotalPaise,
      fuelTotalStr: formatPaiseToMoney(fuelTotalPaise)
    };
  }

  async calculateShiftCngRevenue(shiftId: string) {
    const shift = await this.pumpRepo.findOperationalShiftById(shiftId);
    if (!shift) throw new Error('SHIFT_NOT_FOUND');

    const cngLog = await this.cngRepo.findShiftLog(shiftId);
    const priceSnapshots = await this.financialRepo.listShiftProductPrices(shiftId);
    const cngPriceSnapshots = priceSnapshots.filter(p => p.productCategory === 'CNG');

    if (cngPriceSnapshots.length === 0) {
      return { cngApplicable: false, cngComplete: true, cngTotalPaise: null, cngTotalStr: null, cngProduct: null };
    }
    if (cngPriceSnapshots.length > 1) {
      throw new Error('CNG_PRICE_SNAPSHOT_AMBIGUOUS');
    }

    const priceSnapshot = cngPriceSnapshots[0];
    if (!cngLog) {
      return { cngApplicable: true, cngComplete: false, cngTotalPaise: null, cngTotalStr: null, cngProduct: null };
    }

    const quantityMilliunits = cngLog.netSalesKgMilliunits;
    const pricePaisePerUnit = priceSnapshot.pricePaisePerUnit;
    const revenuePaise = calculateRevenuePaise(quantityMilliunits, pricePaisePerUnit);

    const cngProduct: FinancialRevenueProduct = {
      productId: priceSnapshot.productId,
      productCode: priceSnapshot.productCode,
      productName: priceSnapshot.productName,
      unit: priceSnapshot.unit,
      quantityMilliunits,
      quantityStr: formatMilliunits(quantityMilliunits),
      pricePaisePerUnit,
      pricePerUnitStr: formatPaiseToMoney(pricePaisePerUnit),
      revenuePaise,
      revenueStr: formatPaiseToMoney(revenuePaise)
    };

    return { 
      cngApplicable: true, 
      cngComplete: true, 
      cngTotalPaise: revenuePaise, 
      cngTotalStr: formatPaiseToMoney(revenuePaise), 
      cngProduct 
    };
  }

  async getShiftFinancialSummary(shiftId: string): Promise<ShiftFinancialSummary> {
    const shift = await this.pumpRepo.findOperationalShiftById(shiftId);
    if (!shift) throw new Error('SHIFT_NOT_FOUND');

    const revenue = await this.calculateShiftFuelRevenue(shiftId);
    const cngRevenue = await this.calculateShiftCngRevenue(shiftId);
    const collections = await this.financialRepo.listCollections(shiftId);
    const handovers = await this.financialRepo.listCashHandovers(shiftId);
    const deposits = await this.financialRepo.listBankDeposits(shiftId);
    const reconciliation = await this.financialRepo.findShiftFinancialReconciliation(shiftId);

    const totals = {
      CASH: 0,
      POS_CARD: 0,
      UPI: 0,
      FLEET_CARD: 0,
      CREDIT_SALE: 0,
      DIRECT_BANK_DROP: 0
    };

    const creditSalesByPartyMap = new Map<string, {
      partyCode: string;
      partyName: string;
      amountPaise: number;
    }>();

    collections.forEach(c => {
      totals[c.collectionType] += c.amountPaise;
      if (c.collectionType === 'CREDIT_SALE' && c.creditPartyId) {
        const existing = creditSalesByPartyMap.get(c.creditPartyId);
        if (existing) {
          existing.amountPaise += c.amountPaise;
        } else {
          creditSalesByPartyMap.set(c.creditPartyId, {
            partyCode: c.creditPartyCodeSnapshot || '',
            partyName: c.creditPartyNameSnapshot || '',
            amountPaise: c.amountPaise
          });
        }
      }
    });

    const totalCollectionsPaise = Object.values(totals).reduce((a, b) => a + b, 0);

    const includedComponents = ['FUEL'];
    const pendingComponents = ['LUBE'];
    let authoritativeTotalPaise = revenue.fuelTotalPaise;
    
    if (cngRevenue.cngApplicable) {
      if (cngRevenue.cngComplete) {
        includedComponents.push('CNG');
        authoritativeTotalPaise += (cngRevenue.cngTotalPaise || 0);
      } else {
        pendingComponents.unshift('CNG');
      }
    }

    const variancePaise = authoritativeTotalPaise - totalCollectionsPaise;
    let varianceStatus: FinancialVarianceStatus = 'BALANCED';
    if (variancePaise > 0) varianceStatus = 'SHORTAGE';
    if (variancePaise < 0) varianceStatus = 'EXCESS';

    const verifiedDepositsPaise = deposits
      .filter(d => d.status === 'VERIFIED')
      .reduce((sum, d) => sum + d.amountPaise, 0);

    const pendingCashDepositPaise = totals.CASH - verifiedDepositsPaise;

    return {
      operationalShiftId: shiftId,
      outletId: shift.outletId,
      salesRevenue: {
        byProduct: revenue.byProduct,
        fuelTotalPaise: revenue.fuelTotalPaise,
        fuelTotalStr: revenue.fuelTotalStr,
        cngTotalPaise: cngRevenue.cngTotalPaise,
        cngTotalStr: cngRevenue.cngTotalStr,
        lubeTotalPaise: null,
        lubeTotalStr: null,
        includedComponents: includedComponents as any,
        pendingComponents: pendingComponents as any,
        authoritativeTotalPaise: authoritativeTotalPaise,
        authoritativeTotalStr: formatPaiseToMoney(authoritativeTotalPaise),
        cngProduct: cngRevenue.cngProduct
      },
      collections: {
        cashPaise: totals.CASH,
        cashStr: formatPaiseToMoney(totals.CASH),
        posCardPaise: totals.POS_CARD,
        posCardStr: formatPaiseToMoney(totals.POS_CARD),
        upiPaise: totals.UPI,
        upiStr: formatPaiseToMoney(totals.UPI),
        fleetCardPaise: totals.FLEET_CARD,
        fleetCardStr: formatPaiseToMoney(totals.FLEET_CARD),
        creditSalesPaise: totals.CREDIT_SALE,
        creditSalesStr: formatPaiseToMoney(totals.CREDIT_SALE),
        directBankDropPaise: totals.DIRECT_BANK_DROP,
        directBankDropStr: formatPaiseToMoney(totals.DIRECT_BANK_DROP),
        totalPaise: totalCollectionsPaise,
        totalStr: formatPaiseToMoney(totalCollectionsPaise)
      },
      creditSalesByParty: Array.from(creditSalesByPartyMap.entries()).map(([id, data]) => ({
        creditPartyId: id,
        partyCode: data.partyCode,
        partyName: data.partyName,
        amountPaise: data.amountPaise,
        amountStr: formatPaiseToMoney(data.amountPaise)
      })),
      variancePaise,
      varianceStr: formatPaiseToMoney(variancePaise),
      varianceStatus,
      varianceReason: reconciliation?.varianceReason || null,
      cashHandoverSummary: {
        totalPendingPaise: handovers.filter(h => h.status === 'PENDING').reduce((s, h) => s + h.amountPaise, 0),
        totalPendingStr: formatPaiseToMoney(handovers.filter(h => h.status === 'PENDING').reduce((s, h) => s + h.amountPaise, 0)),
        totalAcknowledgedPaise: handovers.filter(h => h.status === 'ACKNOWLEDGED').reduce((s, h) => s + h.amountPaise, 0),
        totalAcknowledgedStr: formatPaiseToMoney(handovers.filter(h => h.status === 'ACKNOWLEDGED').reduce((s, h) => s + h.amountPaise, 0))
      },
      bankDepositSummary: {
        totalSubmittedPaise: deposits.filter(d => d.status === 'SUBMITTED').reduce((s, d) => s + d.amountPaise, 0),
        totalSubmittedStr: formatPaiseToMoney(deposits.filter(d => d.status === 'SUBMITTED').reduce((s, d) => s + d.amountPaise, 0)),
        totalVerifiedPaise: deposits.filter(d => d.status === 'VERIFIED').reduce((s, d) => s + d.amountPaise, 0),
        totalVerifiedStr: formatPaiseToMoney(deposits.filter(d => d.status === 'VERIFIED').reduce((s, d) => s + d.amountPaise, 0)),
        totalRejectedPaise: deposits.filter(d => d.status === 'REJECTED').reduce((s, d) => s + d.amountPaise, 0),
        totalRejectedStr: formatPaiseToMoney(deposits.filter(d => d.status === 'REJECTED').reduce((s, d) => s + d.amountPaise, 0))
      },
      cashDepositControl: {
        cashCollectedPaise: totals.CASH,
        cashCollectedStr: formatPaiseToMoney(totals.CASH),
        verifiedCashDepositedPaise: verifiedDepositsPaise,
        verifiedCashDepositedStr: formatPaiseToMoney(verifiedDepositsPaise),
        pendingCashDepositPaise: pendingCashDepositPaise,
        pendingCashDepositStr: formatPaiseToMoney(pendingCashDepositPaise)
      }
    };
  }

  async performFinancialReconciliation(
    shiftId: string,
    varianceReason?: string,
    persist = true
  ): Promise<ShiftFinancialReconciliation> {
    const summary = await this.getShiftFinancialSummary(shiftId);

    // CNG Completeness Check
    const cngApplicable = summary.salesRevenue.includedComponents.includes('CNG') || 
                          summary.salesRevenue.pendingComponents.includes('CNG');
    if (cngApplicable && !summary.salesRevenue.includedComponents.includes('CNG')) {
      throw new Error('INCOMPLETE_CNG_DATA');
    }

    const trimmedReason = varianceReason ? varianceReason.trim() : null;
    if (summary.variancePaise !== 0) {
      if (!trimmedReason || trimmedReason.length < 3) {
        throw new Error('VARIANCE_REASON_REQUIRED');
      }
    }

    const data = {
      id: `sfr-${crypto.randomUUID()}`,
      operationalShiftId: shiftId,
      outletId: summary.outletId,
      fuelSalesRevenuePaise: summary.salesRevenue.fuelTotalPaise,
      cngSalesRevenuePaise: summary.salesRevenue.cngTotalPaise,
      lubeSalesRevenuePaise: null,
      authoritativeSalesRevenuePaise: summary.salesRevenue.authoritativeTotalPaise,
      cashCollectionPaise: summary.collections.cashPaise,
      posCollectionPaise: summary.collections.posCardPaise,
      upiCollectionPaise: summary.collections.upiPaise,
      fleetCardCollectionPaise: summary.collections.fleetCardPaise,
      creditSalesPaise: summary.collections.creditSalesPaise,
      directBankDropPaise: summary.collections.directBankDropPaise,
      totalCollectionsPaise: summary.collections.totalPaise,
      salesCollectionVariancePaise: summary.variancePaise,
      varianceStatus: summary.varianceStatus!,
      varianceReason: trimmedReason,
      calculatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (persist) {
      return this.financialRepo.createOrUpdateFinancialReconciliation(data);
    }
    return data as ShiftFinancialReconciliation;
  }
}
