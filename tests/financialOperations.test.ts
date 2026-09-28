import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../src/db';
import { FinancialRepository } from '../src/worker/repositories/financialRepository';
import { FinancialService } from '../src/worker/services/financialService';
import { PumpRepository } from '../src/worker/repositories/pumpRepository';
import { parseMoneyToPaise, parseSignedMoneyToPaise, formatPaiseToMoney } from '../src/shared/financialUtils';

// Mock DB for unit tests
const mockDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => []
        }),
        limit: () => []
      }),
      innerJoin: () => ({
        innerJoin: () => ({
          where: () => []
        })
      })
    })
  }),
  insert: () => ({ values: () => {} }),
  update: () => ({ set: () => ({ where: () => {} }) }),
  batch: async () => {},
  all: () => []
} as any;

describe('Financial Utilities', () => {
  it('should parse money strings to paise correctly', () => {
    expect(parseMoneyToPaise('100')).toBe(10000);
    expect(parseMoneyToPaise('100.5')).toBe(10050);
    expect(parseMoneyToPaise('100.50')).toBe(10050);
    expect(parseMoneyToPaise('0.01')).toBe(1);
    expect(parseSignedMoneyToPaise('-10.50')).toBe(-1050);
    expect(parseMoneyToPaise('0')).toBe(0);
  });

  it('should reject invalid money formats', () => {
    expect(() => parseMoneyToPaise('100.001')).toThrow('INVALID_MONEY_FORMAT');
    expect(() => parseMoneyToPaise('abc')).toThrow('INVALID_MONEY_FORMAT');
    expect(() => parseMoneyToPaise('')).toThrow('INVALID_MONEY_FORMAT');
    expect(() => parseMoneyToPaise('1e3')).toThrow('INVALID_MONEY_FORMAT');
    expect(() => parseMoneyToPaise('-1')).toThrow('INVALID_MONEY_FORMAT');
  });

  it('should format paise to money strings correctly', () => {
    expect(formatPaiseToMoney(0)).toBe('0.00');
    expect(formatPaiseToMoney(1)).toBe('0.01');
    expect(formatPaiseToMoney(99)).toBe('0.99');
    expect(formatPaiseToMoney(100)).toBe('1.00');
    expect(formatPaiseToMoney(101)).toBe('1.01');
    expect(formatPaiseToMoney(-1)).toBe('-0.01');
    expect(formatPaiseToMoney(-99)).toBe('-0.99');
    expect(formatPaiseToMoney(-100)).toBe('-1.00');
    expect(formatPaiseToMoney(-101)).toBe('-1.01');
  });
});

describe('Financial Service Logic', () => {
  let service: FinancialService;
  let financialRepo: FinancialRepository;
  let pumpRepo: PumpRepository;

  beforeEach(() => {
    financialRepo = new FinancialRepository(mockDb);
    pumpRepo = new PumpRepository(mockDb);
    service = new FinancialService(financialRepo, pumpRepo);
  });

  it('should calculate shift revenue with rounding logic correctly', async () => {
    // Mock data for calculateShiftFuelRevenue
    // Nozzle snapshots, meter readings, price snapshots
    const mockShift = { id: 'shift-1', outletId: 'out-1' };
    const mockNozzles = [
      { nozzleId: 'n-1', productId: 'p-1', productCode: 'MS', productUnit: 'LITRE' }
    ];
    const mockReadings = [
      { nozzleId: 'n-1', netSalesQuantityMilliunits: 10500 } // 10.500 Litres
    ];
    const mockPrices = [
      { productId: 'p-1', pricePaisePerUnit: 9550 } // 95.50 per Litre
    ];

    // Override repo methods for this test
    pumpRepo.findOperationalShiftById = async () => mockShift as any;
    pumpRepo.listShiftNozzleSnapshots = async () => mockNozzles as any;
    pumpRepo.listReadingsForShift = async () => mockReadings as any;
    financialRepo.listShiftProductPrices = async () => mockPrices as any;

    const result = await service.calculateShiftFuelRevenue('shift-1');

    // 10.500 * 95.50 = 1002.75
    // paise = 100275
    // In our logic: (10500 * 9550) / 1000 = 100275000 / 1000 = 100275
    expect(result.fuelTotalPaise).toBe(100275);
    expect(result.fuelTotalStr).toBe('1002.75');
  });

  it('should handle rounding for half-paise correctly', async () => {
    const mockShift = { id: 'shift-1', outletId: 'out-1' };
    const mockNozzles = [{ nozzleId: 'n-1', productId: 'p-1', productCode: 'MS', productUnit: 'LITRE' }];
    
    // 1.005 Litres * 1.00 Price (100 paise) = 100.5 paise -> rounds to 101 paise
    const mockReadings = [{ nozzleId: 'n-1', netSalesQuantityMilliunits: 1005 }]; 
    const mockPrices = [{ productId: 'p-1', pricePaisePerUnit: 100 }];

    pumpRepo.findOperationalShiftById = async () => mockShift as any;
    pumpRepo.listShiftNozzleSnapshots = async () => mockNozzles as any;
    pumpRepo.listReadingsForShift = async () => mockReadings as any;
    financialRepo.listShiftProductPrices = async () => mockPrices as any;

    const result = await service.calculateShiftFuelRevenue('shift-1');
    expect(result.fuelTotalPaise).toBe(101);
  });
});
