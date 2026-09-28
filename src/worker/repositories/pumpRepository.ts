import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc, sql, ne } from 'drizzle-orm';
import {
  Product,
  OutletProduct,
  Tank,
  Dispenser,
  Nozzle,
  ShiftTemplate,
  OperationalShift,
  NozzleMeterReading,
  NozzleUnavailabilityRecord,
  ShiftSalesSummary,
  ShiftEntryGridItem,
} from '../../shared/types';

// Precise fuel arithmetic: 3 decimal places (e.g. 123.456 L)
const PRECISION = 1000;

export function round3(val: number): number {
  return Math.round((val + Number.EPSILON) * PRECISION) / PRECISION;
}

export function calcGrossQuantity(closing: number, opening: number): number {
  const scaled = Math.round(closing * PRECISION) - Math.round(opening * PRECISION);
  return scaled / PRECISION;
}

export function calcNetQuantity(gross: number, testing: number): number {
  const scaled = Math.round(gross * PRECISION) - Math.round(testing * PRECISION);
  return scaled / PRECISION;
}

export class PumpRepository {
  constructor(private db: AppDatabase) {}

  // ==========================================
  // 1. PRODUCT MASTER
  // ==========================================

  async listProducts(): Promise<Product[]> {
    const list = await this.db.select().from(schema.products).orderBy(schema.products.code);
    return list as Product[];
  }

  async findProductById(id: string): Promise<Product | null> {
    const [prod] = await this.db.select().from(schema.products).where(eq(schema.products.id, id));
    return (prod as Product) || null;
  }

  async findProductByCode(code: string): Promise<Product | null> {
    const [prod] = await this.db.select().from(schema.products).where(eq(schema.products.code, code.toUpperCase()));
    return (prod as Product) || null;
  }

  async createProduct(data: {
    id: string;
    code: string;
    name: string;
    category: string;
    unit: 'LITRE' | 'KG';
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: string;
    updatedAt: string;
  }): Promise<Product> {
    await this.db.insert(schema.products).values({
      ...data,
      code: data.code.toUpperCase(),
    });
    return (await this.findProductById(data.id))!;
  }

  async updateProduct(id: string, data: Partial<{
    name: string;
    category: string;
    unit: 'LITRE' | 'KG';
    status: 'ACTIVE' | 'INACTIVE';
    updatedAt: string;
  }>): Promise<Product | null> {
    await this.db.update(schema.products).set(data).where(eq(schema.products.id, id));
    return this.findProductById(id);
  }

  // ==========================================
  // 2. OUTLET PRODUCTS MAPPING
  // ==========================================

  async listOutletProducts(outletId: string): Promise<OutletProduct[]> {
    const rows = await this.db
      .select({
        mapping: schema.outletProducts,
        product: schema.products,
      })
      .from(schema.outletProducts)
      .innerJoin(schema.products, eq(schema.outletProducts.productId, schema.products.id))
      .where(eq(schema.outletProducts.outletId, outletId));

    return rows.map(r => ({
      id: r.mapping.id,
      outletId: r.mapping.outletId,
      productId: r.mapping.productId,
      status: r.mapping.status as 'ACTIVE' | 'INACTIVE',
      createdAt: r.mapping.createdAt,
      createdBy: r.mapping.createdBy,
      product: r.product as Product,
    }));
  }

  async findOutletProduct(outletId: string, productId: string): Promise<OutletProduct | null> {
    const [row] = await this.db
      .select()
      .from(schema.outletProducts)
      .where(and(eq(schema.outletProducts.outletId, outletId), eq(schema.outletProducts.productId, productId)));

    return (row as OutletProduct) || null;
  }

  async mapProductToOutlet(data: {
    id: string;
    outletId: string;
    productId: string;
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: string;
    createdBy: string;
  }): Promise<OutletProduct> {
    await this.db.insert(schema.outletProducts).values(data);
    const mapped = await this.findOutletProduct(data.outletId, data.productId);
    return mapped!;
  }

  async updateOutletProductStatus(outletId: string, productId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<OutletProduct | null> {
    await this.db
      .update(schema.outletProducts)
      .set({ status })
      .where(and(eq(schema.outletProducts.outletId, outletId), eq(schema.outletProducts.productId, productId)));
    return this.findOutletProduct(outletId, productId);
  }

  // ==========================================
  // 3. UNDERGROUND TANKS
  // ==========================================

  async listTanksByOutlet(outletId: string): Promise<Tank[]> {
    const rows = await this.db
      .select({
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.tanks)
      .innerJoin(schema.products, eq(schema.tanks.productId, schema.products.id))
      .where(eq(schema.tanks.outletId, outletId))
      .orderBy(schema.tanks.tankNumber);

    return rows.map(r => ({
      ...r.tank,
      status: r.tank.status as any,
      productName: r.product.name,
      productCode: r.product.code,
    }));
  }

  async findTankById(id: string): Promise<Tank | null> {
    const [row] = await this.db
      .select({
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.tanks)
      .innerJoin(schema.products, eq(schema.tanks.productId, schema.products.id))
      .where(eq(schema.tanks.id, id));

    if (!row) return null;
    return {
      ...row.tank,
      status: row.tank.status as any,
      productName: row.product.name,
      productCode: row.product.code,
    };
  }

  async findTankByOutletAndNumber(outletId: string, tankNumber: number): Promise<Tank | null> {
    const [tank] = await this.db
      .select()
      .from(schema.tanks)
      .where(and(eq(schema.tanks.outletId, outletId), eq(schema.tanks.tankNumber, tankNumber)));
    return (tank as Tank) || null;
  }

  async createTank(data: {
    id: string;
    outletId: string;
    tankNumber: number;
    name: string;
    productId: string;
    capacityLitres: number;
    safeFillCapacityLitres: number;
    minimumOperatingLevelLitres: number;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    commissionedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }): Promise<Tank> {
    await this.db.insert(schema.tanks).values(data);
    return (await this.findTankById(data.id))!;
  }

  async updateTank(id: string, data: Partial<{
    name: string;
    productId: string;
    capacityLitres: number;
    safeFillCapacityLitres: number;
    minimumOperatingLevelLitres: number;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    commissionedAt: string | null;
    updatedAt: string;
  }>): Promise<Tank | null> {
    await this.db.update(schema.tanks).set(data).where(eq(schema.tanks.id, id));
    return this.findTankById(id);
  }

  // ==========================================
  // 4. DISPENSERS
  // ==========================================

  async listDispensersByOutlet(outletId: string): Promise<Dispenser[]> {
    const dispList = await this.db
      .select()
      .from(schema.dispensers)
      .where(eq(schema.dispensers.outletId, outletId))
      .orderBy(schema.dispensers.dispenserNumber);

    const withCount = await Promise.all(
      dispList.map(async (d) => {
        const nozzCount = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(schema.nozzles)
          .where(eq(schema.nozzles.dispenserId, d.id));
        return {
          ...d,
          status: d.status as any,
          nozzlesCount: Number(nozzCount[0]?.count || 0),
        };
      })
    );

    return withCount;
  }

  async findDispenserById(id: string): Promise<Dispenser | null> {
    const [disp] = await this.db.select().from(schema.dispensers).where(eq(schema.dispensers.id, id));
    if (!disp) return null;
    return disp as Dispenser;
  }

  async findDispenserByOutletAndNumber(outletId: string, dispenserNumber: number): Promise<Dispenser | null> {
    const [disp] = await this.db
      .select()
      .from(schema.dispensers)
      .where(and(eq(schema.dispensers.outletId, outletId), eq(schema.dispensers.dispenserNumber, dispenserNumber)));
    return (disp as Dispenser) || null;
  }

  async findDispenserBySerialNumber(serialNumber: string): Promise<Dispenser | null> {
    const [disp] = await this.db
      .select()
      .from(schema.dispensers)
      .where(eq(schema.dispensers.serialNumber, serialNumber));
    return (disp as Dispenser) || null;
  }

  async createDispenser(data: {
    id: string;
    outletId: string;
    dispenserNumber: number;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    commissionedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }): Promise<Dispenser> {
    await this.db.insert(schema.dispensers).values(data);
    return (await this.findDispenserById(data.id))!;
  }

  async updateDispenser(id: string, data: Partial<{
    name: string;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    commissionedAt: string | null;
    updatedAt: string;
  }>): Promise<Dispenser | null> {
    await this.db.update(schema.dispensers).set(data).where(eq(schema.dispensers.id, id));
    return this.findDispenserById(id);
  }

  // ==========================================
  // 5. NOZZLES
  // ==========================================

  async listNozzlesByOutlet(outletId: string): Promise<Nozzle[]> {
    const rows = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .innerJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .innerJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .innerJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .where(eq(schema.nozzles.outletId, outletId))
      .orderBy(schema.dispensers.dispenserNumber, schema.nozzles.nozzleNumber);

    return rows.map(r => ({
      ...r.nozzle,
      status: r.nozzle.status as any,
      dispenserNumber: r.dispenser.dispenserNumber,
      dispenserName: r.dispenser.name,
      productName: r.product.name,
      productCode: r.product.code,
      tankNumber: r.tank.tankNumber,
      tankName: r.tank.name,
    }));
  }

  async listNozzlesByDispenser(dispenserId: string): Promise<Nozzle[]> {
    const rows = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .innerJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .innerJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .innerJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .where(eq(schema.nozzles.dispenserId, dispenserId))
      .orderBy(schema.nozzles.nozzleNumber);

    return rows.map(r => ({
      ...r.nozzle,
      status: r.nozzle.status as any,
      dispenserNumber: r.dispenser.dispenserNumber,
      dispenserName: r.dispenser.name,
      productName: r.product.name,
      productCode: r.product.code,
      tankNumber: r.tank.tankNumber,
      tankName: r.tank.name,
    }));
  }

  async findNozzleById(id: string): Promise<Nozzle | null> {
    const [row] = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .innerJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .innerJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .innerJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .where(eq(schema.nozzles.id, id));

    if (!row) return null;
    return {
      ...row.nozzle,
      status: row.nozzle.status as any,
      dispenserNumber: row.dispenser.dispenserNumber,
      dispenserName: row.dispenser.name,
      productName: row.product.name,
      productCode: row.product.code,
      tankNumber: row.tank.tankNumber,
      tankName: row.tank.name,
    };
  }

  async findNozzleByDispenserAndNumber(dispenserId: string, nozzleNumber: number): Promise<Nozzle | null> {
    const [n] = await this.db
      .select()
      .from(schema.nozzles)
      .where(and(eq(schema.nozzles.dispenserId, dispenserId), eq(schema.nozzles.nozzleNumber, nozzleNumber)));
    return (n as Nozzle) || null;
  }

  async createNozzle(data: {
    id: string;
    outletId: string;
    dispenserId: string;
    nozzleNumber: number;
    productId: string;
    tankId: string;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }): Promise<Nozzle> {
    await this.db.insert(schema.nozzles).values(data);
    return (await this.findNozzleById(data.id))!;
  }

  async updateNozzle(id: string, data: Partial<{
    productId: string;
    tankId: string;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
    updatedAt: string;
  }>): Promise<Nozzle | null> {
    await this.db.update(schema.nozzles).set(data).where(eq(schema.nozzles.id, id));
    return this.findNozzleById(id);
  }

  // ==========================================
  // 6. SHIFT TEMPLATES
  // ==========================================

  async listShiftTemplatesByOutlet(outletId: string): Promise<ShiftTemplate[]> {
    const list = await this.db
      .select()
      .from(schema.shiftTemplates)
      .where(eq(schema.shiftTemplates.outletId, outletId))
      .orderBy(schema.shiftTemplates.sequence);

    return list as ShiftTemplate[];
  }

  async findShiftTemplateById(id: string): Promise<ShiftTemplate | null> {
    const [tpl] = await this.db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, id));
    return (tpl as ShiftTemplate) || null;
  }

  async findShiftTemplateByCode(outletId: string, code: string): Promise<ShiftTemplate | null> {
    const [tpl] = await this.db
      .select()
      .from(schema.shiftTemplates)
      .where(and(eq(schema.shiftTemplates.outletId, outletId), eq(schema.shiftTemplates.code, code.toUpperCase())));
    return (tpl as ShiftTemplate) || null;
  }

  async createShiftTemplate(data: {
    id: string;
    outletId: string;
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    sequence: number;
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: string;
    updatedAt: string;
    createdBy: string;
  }): Promise<ShiftTemplate> {
    await this.db.insert(schema.shiftTemplates).values({
      ...data,
      code: data.code.toUpperCase(),
    });
    return (await this.findShiftTemplateById(data.id))!;
  }

  async updateShiftTemplate(id: string, data: Partial<{
    name: string;
    startTime: string;
    endTime: string;
    sequence: number;
    status: 'ACTIVE' | 'INACTIVE';
    updatedAt: string;
  }>): Promise<ShiftTemplate | null> {
    await this.db.update(schema.shiftTemplates).set(data).where(eq(schema.shiftTemplates.id, id));
    return this.findShiftTemplateById(id);
  }

  // ==========================================
  // 7. OPERATIONAL SHIFTS
  // ==========================================

  async listOperationalShiftsByOutlet(outletId: string, limit = 50): Promise<OperationalShift[]> {
    const rows = await this.db
      .select({
        shift: schema.operationalShifts,
        template: schema.shiftTemplates,
        openedBy: schema.users,
      })
      .from(schema.operationalShifts)
      .innerJoin(schema.shiftTemplates, eq(schema.operationalShifts.shiftTemplateId, schema.shiftTemplates.id))
      .innerJoin(schema.users, eq(schema.operationalShifts.openedByUserId, schema.users.id))
      .where(eq(schema.operationalShifts.outletId, outletId))
      .orderBy(desc(schema.operationalShifts.businessDate), desc(schema.operationalShifts.startedAt))
      .limit(limit);

    return rows.map(r => ({
      ...r.shift,
      status: r.shift.status as any,
      shiftTemplateName: r.template.name,
      shiftTemplateCode: r.template.code,
      openedByName: r.openedBy.name,
    }));
  }

  async findOperationalShiftById(id: string): Promise<OperationalShift | null> {
    const [row] = await this.db
      .select({
        shift: schema.operationalShifts,
        template: schema.shiftTemplates,
        openedBy: schema.users,
        outlet: schema.retailOutlets,
      })
      .from(schema.operationalShifts)
      .innerJoin(schema.shiftTemplates, eq(schema.operationalShifts.shiftTemplateId, schema.shiftTemplates.id))
      .innerJoin(schema.users, eq(schema.operationalShifts.openedByUserId, schema.users.id))
      .innerJoin(schema.retailOutlets, eq(schema.operationalShifts.outletId, schema.retailOutlets.id))
      .where(eq(schema.operationalShifts.id, id));

    if (!row) return null;

    let closedByName: string | undefined;
    if (row.shift.closedByUserId) {
      const [u] = await this.db.select().from(schema.users).where(eq(schema.users.id, row.shift.closedByUserId));
      closedByName = u?.name;
    }

    return {
      ...row.shift,
      status: row.shift.status as any,
      shiftTemplateName: row.template.name,
      shiftTemplateCode: row.template.code,
      openedByName: row.openedBy.name,
      closedByName,
      outletName: row.outlet.name,
      roCode: row.outlet.roCode,
    };
  }

  async findExistingShift(outletId: string, shiftTemplateId: string, businessDate: string): Promise<OperationalShift | null> {
    const [s] = await this.db
      .select()
      .from(schema.operationalShifts)
      .where(
        and(
          eq(schema.operationalShifts.outletId, outletId),
          eq(schema.operationalShifts.shiftTemplateId, shiftTemplateId),
          eq(schema.operationalShifts.businessDate, businessDate)
        )
      );
    return (s as OperationalShift) || null;
  }

  async openOperationalShift(data: {
    id: string;
    outletId: string;
    shiftTemplateId: string;
    businessDate: string;
    startedAt: string;
    openedByUserId: string;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<OperationalShift> {
    await this.db.insert(schema.operationalShifts).values({
      ...data,
      status: 'OPEN',
      closedAt: null,
      closedByUserId: null,
      notes: data.notes || null,
    });
    return (await this.findOperationalShiftById(data.id))!;
  }

  async closeOperationalShift(shiftId: string, closedByUserId: string): Promise<OperationalShift> {
    const nowIso = new Date().toISOString();
    await this.db
      .update(schema.operationalShifts)
      .set({
        status: 'CLOSED',
        closedAt: nowIso,
        closedByUserId,
        updatedAt: nowIso,
      })
      .where(eq(schema.operationalShifts.id, shiftId));

    return (await this.findOperationalShiftById(shiftId))!;
  }

  // ==========================================
  // 8. NOZZLE METER READINGS & CONTINUITY
  // ==========================================

  async getLatestClosedReadingForNozzle(nozzleId: string): Promise<NozzleMeterReading | null> {
    const rows = await this.db
      .select({
        reading: schema.nozzleMeterReadings,
        shift: schema.operationalShifts,
      })
      .from(schema.nozzleMeterReadings)
      .innerJoin(schema.operationalShifts, eq(schema.nozzleMeterReadings.operationalShiftId, schema.operationalShifts.id))
      .where(
        and(
          eq(schema.nozzleMeterReadings.nozzleId, nozzleId),
          eq(schema.operationalShifts.status, 'CLOSED')
        )
      )
      .orderBy(
        desc(schema.operationalShifts.businessDate),
        desc(schema.operationalShifts.startedAt),
        desc(schema.nozzleMeterReadings.createdAt)
      )
      .limit(1);

    if (rows.length === 0) return null;
    return rows[0].reading as NozzleMeterReading;
  }

  async listReadingsForShift(shiftId: string): Promise<NozzleMeterReading[]> {
    const rows = await this.db
      .select({
        reading: schema.nozzleMeterReadings,
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        user: schema.users,
      })
      .from(schema.nozzleMeterReadings)
      .innerJoin(schema.nozzles, eq(schema.nozzleMeterReadings.nozzleId, schema.nozzles.id))
      .innerJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .innerJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .innerJoin(schema.users, eq(schema.nozzleMeterReadings.recordedByUserId, schema.users.id))
      .where(eq(schema.nozzleMeterReadings.operationalShiftId, shiftId))
      .orderBy(schema.dispensers.dispenserNumber, schema.nozzles.nozzleNumber);

    return rows.map(r => ({
      ...r.reading,
      hasOpeningVariance: Boolean(r.reading.hasOpeningVariance),
      openingVarianceQuantity: r.reading.openingVarianceQuantity ?? 0,
      nozzleNumber: r.nozzle.nozzleNumber,
      dispenserNumber: r.dispenser.dispenserNumber,
      dispenserName: r.dispenser.name,
      productName: r.product.name,
      productCode: r.product.code,
      recorderName: r.user.name,
    }));
  }

  async findReadingByShiftAndNozzle(shiftId: string, nozzleId: string): Promise<NozzleMeterReading | null> {
    const [row] = await this.db
      .select()
      .from(schema.nozzleMeterReadings)
      .where(
        and(
          eq(schema.nozzleMeterReadings.operationalShiftId, shiftId),
          eq(schema.nozzleMeterReadings.nozzleId, nozzleId)
        )
      );
    if (!row) return null;
    return {
      ...row,
      hasOpeningVariance: Boolean(row.hasOpeningVariance),
      openingVarianceQuantity: row.openingVarianceQuantity ?? 0,
    } as NozzleMeterReading;
  }

  async findReadingById(id: string): Promise<NozzleMeterReading | null> {
    const [row] = await this.db.select().from(schema.nozzleMeterReadings).where(eq(schema.nozzleMeterReadings.id, id));
    if (!row) return null;
    return {
      ...row,
      hasOpeningVariance: Boolean(row.hasOpeningVariance),
      openingVarianceQuantity: row.openingVarianceQuantity ?? 0,
    } as NozzleMeterReading;
  }

  async createReading(data: {
    id: string;
    operationalShiftId: string;
    outletId: string;
    nozzleId: string;
    openingTotalizer: number;
    closingTotalizer: number;
    testingQuantity: number;
    grossSalesQuantity: number;
    netSalesQuantity: number;
    recordedByUserId: string;
    hasOpeningVariance: boolean;
    openingVarianceQuantity: number;
    varianceReason: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<NozzleMeterReading> {
    await this.db.insert(schema.nozzleMeterReadings).values(data);
    return (await this.findReadingById(data.id))!;
  }

  async updateReading(id: string, data: Partial<{
    openingTotalizer: number;
    closingTotalizer: number;
    testingQuantity: number;
    grossSalesQuantity: number;
    netSalesQuantity: number;
    hasOpeningVariance: boolean;
    openingVarianceQuantity: number;
    varianceReason: string | null;
    updatedAt: string;
  }>): Promise<NozzleMeterReading | null> {
    await this.db.update(schema.nozzleMeterReadings).set(data).where(eq(schema.nozzleMeterReadings.id, id));
    return this.findReadingById(id);
  }

  // ==========================================
  // 9. NOZZLE UNAVAILABILITY RECORDS
  // ==========================================

  async listUnavailabilityForShift(shiftId: string): Promise<NozzleUnavailabilityRecord[]> {
    const rows = await this.db
      .select({
        record: schema.nozzleUnavailabilityRecords,
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        user: schema.users,
      })
      .from(schema.nozzleUnavailabilityRecords)
      .innerJoin(schema.nozzles, eq(schema.nozzleUnavailabilityRecords.nozzleId, schema.nozzles.id))
      .innerJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .innerJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .innerJoin(schema.users, eq(schema.nozzleUnavailabilityRecords.recordedBy, schema.users.id))
      .where(eq(schema.nozzleUnavailabilityRecords.operationalShiftId, shiftId));

    return rows.map(r => ({
      ...r.record,
      nozzleNumber: r.nozzle.nozzleNumber,
      dispenserNumber: r.dispenser.dispenserNumber,
      productName: r.product.name,
      recordedByName: r.user.name,
    }));
  }

  async findUnavailability(shiftId: string, nozzleId: string): Promise<NozzleUnavailabilityRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.nozzleUnavailabilityRecords)
      .where(
        and(
          eq(schema.nozzleUnavailabilityRecords.operationalShiftId, shiftId),
          eq(schema.nozzleUnavailabilityRecords.nozzleId, nozzleId)
        )
      );
    return (row as NozzleUnavailabilityRecord) || null;
  }

  async recordUnavailability(data: {
    id: string;
    operationalShiftId: string;
    nozzleId: string;
    reason: string;
    recordedBy: string;
    createdAt: string;
  }): Promise<NozzleUnavailabilityRecord> {
    await this.db.insert(schema.nozzleUnavailabilityRecords).values(data);
    return (await this.findUnavailability(data.operationalShiftId, data.nozzleId))!;
  }

  async removeUnavailability(shiftId: string, nozzleId: string): Promise<boolean> {
    const res = await this.db
      .delete(schema.nozzleUnavailabilityRecords)
      .where(
        and(
          eq(schema.nozzleUnavailabilityRecords.operationalShiftId, shiftId),
          eq(schema.nozzleUnavailabilityRecords.nozzleId, nozzleId)
        )
      );
    return true;
  }

  // ==========================================
  // 10. SHIFT ENTRY GRID HELPER
  // ==========================================

  async getShiftEntryGrid(shiftId: string): Promise<ShiftEntryGridItem[]> {
    const shift = await this.findOperationalShiftById(shiftId);
    if (!shift) return [];

    const activeNozzles = await this.listActiveNozzlesForOutlet(shift.outletId);
    const readings = await this.listReadingsForShift(shiftId);
    const unavails = await this.listUnavailabilityForShift(shiftId);

    const readingMap = new Map<string, NozzleMeterReading>();
    readings.forEach(r => readingMap.set(r.nozzleId, r));

    const unavailMap = new Map<string, NozzleUnavailabilityRecord>();
    unavails.forEach(u => unavailMap.set(u.nozzleId, u));

    const grid: ShiftEntryGridItem[] = [];

    for (const nozzle of activeNozzles) {
      const reading = readingMap.get(nozzle.id) || null;
      const unavail = unavailMap.get(nozzle.id) || null;

      const prevReading = await this.getLatestClosedReadingForNozzle(nozzle.id);
      const suggestedOpeningTotalizer = prevReading ? prevReading.closingTotalizer : 0;

      grid.push({
        nozzle,
        reading,
        unavailability: unavail,
        suggestedOpeningTotalizer,
        hasPreviousShift: prevReading !== null,
      });
    }

    return grid;
  }

  async listActiveNozzlesForOutlet(outletId: string): Promise<Nozzle[]> {
    const rows = await this.db
      .select({
        nozzle: schema.nozzles,
        dispenser: schema.dispensers,
        product: schema.products,
        tank: schema.tanks,
      })
      .from(schema.nozzles)
      .innerJoin(schema.dispensers, eq(schema.nozzles.dispenserId, schema.dispensers.id))
      .innerJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .innerJoin(schema.tanks, eq(schema.nozzles.tankId, schema.tanks.id))
      .where(
        and(
          eq(schema.nozzles.outletId, outletId),
          eq(schema.nozzles.status, 'ACTIVE'),
          eq(schema.dispensers.status, 'ACTIVE')
        )
      )
      .orderBy(schema.dispensers.dispenserNumber, schema.nozzles.nozzleNumber);

    return rows.map(r => ({
      ...r.nozzle,
      status: r.nozzle.status as any,
      dispenserNumber: r.dispenser.dispenserNumber,
      dispenserName: r.dispenser.name,
      productName: r.product.name,
      productCode: r.product.code,
      tankNumber: r.tank.tankNumber,
      tankName: r.tank.name,
    }));
  }

  // ==========================================
  // 11. AUTHORITATIVE SALES SUMMARY
  // ==========================================

  async getSalesSummary(shiftId: string): Promise<ShiftSalesSummary | null> {
    const shift = await this.findOperationalShiftById(shiftId);
    if (!shift) return null;

    const activeNozzles = await this.listActiveNozzlesForOutlet(shift.outletId);
    const readings = await this.listReadingsForShift(shiftId);
    const unavails = await this.listUnavailabilityForShift(shiftId);

    const readingMap = new Map<string, NozzleMeterReading>();
    readings.forEach(r => readingMap.set(r.nozzleId, r));

    const unavailMap = new Map<string, NozzleUnavailabilityRecord>();
    unavails.forEach(u => unavailMap.set(u.nozzleId, u));

    // Per nozzle aggregation
    const byNozzle: ShiftSalesSummary['byNozzle'] = [];
    for (const nozzle of activeNozzles) {
      const r = readingMap.get(nozzle.id);
      const u = unavailMap.get(nozzle.id);

      byNozzle.push({
        nozzleId: nozzle.id,
        nozzleNumber: nozzle.nozzleNumber,
        dispenserId: nozzle.dispenserId,
        dispenserNumber: nozzle.dispenserNumber || 0,
        productId: nozzle.productId,
        productName: nozzle.productName || 'Fuel',
        productCategory: nozzle.productCode || 'MS',
        unit: 'LITRE',
        openingTotalizer: r ? r.openingTotalizer : null,
        closingTotalizer: r ? r.closingTotalizer : null,
        grossQuantity: r ? r.grossSalesQuantity : 0,
        testingQuantity: r ? r.testingQuantity : 0,
        netQuantity: r ? r.netSalesQuantity : 0,
        isUnavailable: Boolean(u),
        unavailableReason: u ? u.reason : null,
        hasVariance: r ? Boolean(r.hasOpeningVariance) : false,
        varianceQuantity: r ? (r.openingVarianceQuantity || 0) : 0,
      });
    }

    // Per dispenser aggregation
    const dispenserMap = new Map<string, {
      dispenserId: string;
      dispenserNumber: number;
      name: string;
      grossQuantity: number;
      testingQuantity: number;
      netQuantity: number;
    }>();

    for (const item of byNozzle) {
      let d = dispenserMap.get(item.dispenserId);
      if (!d) {
        d = {
          dispenserId: item.dispenserId,
          dispenserNumber: item.dispenserNumber,
          name: `Dispenser #${item.dispenserNumber}`,
          grossQuantity: 0,
          testingQuantity: 0,
          netQuantity: 0,
        };
        dispenserMap.set(item.dispenserId, d);
      }
      d.grossQuantity = round3(d.grossQuantity + item.grossQuantity);
      d.testingQuantity = round3(d.testingQuantity + item.testingQuantity);
      d.netQuantity = round3(d.netQuantity + item.netQuantity);
    }

    const byDispenser = Array.from(dispenserMap.values()).sort((a, b) => a.dispenserNumber - b.dispenserNumber);

    // By product aggregation
    const productMap = new Map<string, {
      productId: string;
      productName: string;
      category: string;
      unit: string;
      grossQuantity: number;
      testingQuantity: number;
      netQuantity: number;
    }>();

    for (const item of byNozzle) {
      let p = productMap.get(item.productId);
      if (!p) {
        p = {
          productId: item.productId,
          productName: item.productName,
          category: item.productCategory,
          unit: item.unit,
          grossQuantity: 0,
          testingQuantity: 0,
          netQuantity: 0,
        };
        productMap.set(item.productId, p);
      }
      p.grossQuantity = round3(p.grossQuantity + item.grossQuantity);
      p.testingQuantity = round3(p.testingQuantity + item.testingQuantity);
      p.netQuantity = round3(p.netQuantity + item.netQuantity);
    }

    const byProduct = Array.from(productMap.values());

    // Total outlet quantity
    let totalGross = 0;
    let totalTesting = 0;
    let totalNet = 0;

    for (const item of byNozzle) {
      totalGross += item.grossQuantity;
      totalTesting += item.testingQuantity;
      totalNet += item.netQuantity;
    }

    return {
      operationalShiftId: shift.id,
      businessDate: shift.businessDate,
      status: shift.status,
      outletId: shift.outletId,
      byNozzle,
      byDispenser,
      byProduct,
      totalOutletQuantity: {
        grossQuantity: round3(totalGross),
        testingQuantity: round3(totalTesting),
        netQuantity: round3(totalNet),
      },
    };
  }
}
