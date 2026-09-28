import { FinancialRepository } from '../repositories/financialRepository';
import { PumpRepository } from '../repositories/pumpRepository';
import { 
  ShiftFinancialSummary, 
  FinancialRevenueProduct, 
  FinancialVarianceStatus,
  ShiftFinancialReconciliation
} from '../../shared/types';
import { formatPaiseToMoney } from '../../shared/financialUtils';
import { formatMilliunits } from '../../shared/precision';

export class FinancialService {
  constructor(
    private financialRepo: FinancialRepository,
    private pumpRepo: PumpRepository
  ) {}

  async calculateShiftFuelRevenue(shiftId: string) {
    const shift = await this.pumpRepo.findOperationalShiftById(shiftId);
    if (!shift) throw new Error('SHIFT_NOT_FOUND');

    const nozzleSnapshots = await this.pumpRepo.listShiftNozzleSnapshots(shiftId);
    const meterReadings = await this.pumpRepo.listReadingsForShift(shiftId);
    const priceSnapshots = await this.financialRepo.listShiftProductPrices(shiftId);

    const priceMap = new Map<string, number>();
    priceSnapshots.forEach(p => priceMap.set(p.productId, p.pricePaisePerUnit));

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
      const reading = readingMap.get(nozzle.nozzleId);
      const netQuantity = reading?.netSalesQuantityMilliunits || 0;
      const price = priceMap.get(nozzle.productId) || 0;

      let pData = productTotals.get(nozzle.productId);
      if (!pData) {
        pData = {
          productCode: nozzle.productCode,
          productName: nozzle.productName || '',
          unit: nozzle.productUnit,
          quantityMilliunits: 0,
          pricePaisePerUnit: price
        };
        productTotals.set(nozzle.productId, pData);
      }
      pData.quantityMilliunits += netQuantity;
    }

    const byProduct: FinancialRevenueProduct[] = [];
    let fuelTotalPaise = 0;

    for (const [productId, data] of productTotals.entries()) {
      // quantityMilliunits * pricePaisePerUnit / 1000
      // Use BigInt for intermediate calculation
      const numerator = BigInt(data.quantityMilliunits) * BigInt(data.pricePaisePerUnit);
      const quotient = numerator / 1000n;
      const remainder = numerator % 1000n;
      
      let revenuePaise = Number(quotient);
      if (remainder >= 500n) {
        revenuePaise += 1;
      }

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

  async getShiftFinancialSummary(shiftId: string): Promise<ShiftFinancialSummary> {
    const shift = await this.pumpRepo.findOperationalShiftById(shiftId);
    if (!shift) throw new Error('SHIFT_NOT_FOUND');

    const revenue = await this.calculateShiftFuelRevenue(shiftId);
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

    const variancePaise = revenue.fuelTotalPaise - totalCollectionsPaise;
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
        cngTotalPaise: null,
        cngTotalStr: null,
        lubeTotalPaise: null,
        lubeTotalStr: null,
        includedComponents: ['FUEL'],
        pendingComponents: ['CNG', 'LUBE'],
        authoritativeTotalPaise: revenue.fuelTotalPaise,
        authoritativeTotalStr: revenue.fuelTotalStr
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

  async performFinancialReconciliation(shiftId: string, varianceReason?: string): Promise<ShiftFinancialReconciliation> {
    const summary = await this.getShiftFinancialSummary(shiftId);

    const data = {
      id: `sfr-${crypto.randomUUID()}`,
      operationalShiftId: shiftId,
      outletId: summary.outletId,
      fuelSalesRevenuePaise: summary.salesRevenue.fuelTotalPaise,
      cngSalesRevenuePaise: null,
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
      varianceReason: varianceReason || null,
      calculatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return this.financialRepo.createOrUpdateFinancialReconciliation(data);
  }
}
