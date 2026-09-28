import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, and, desc, asc, sql, ne, inArray, lte } from 'drizzle-orm';
import {
  Product,
  OutletProduct,
  Tank,
  Dispenser,
  Nozzle,
  ShiftTemplate,
  OperationalShift,
  OperationalShiftNozzleSnapshot,
  OperationalShiftTankSnapshot,
  NozzleMeterReading,
  NozzleUnavailabilityRecord,
  ShiftSalesSummary,
  ShiftEntryGridItem,
  UnitQuantitySummary,
  ProductUnit,
  TankCalibrationPoint,
  TankStockReading,
  TankReadingType,
  TankReadingSource,
  FuelReceipt,
  FuelReceiptTankLine,
  FuelReceiptStatus,
  QualityStatus,
  QualityToleranceSetting,
  QualityScopeType,
  ShiftStockReconciliation,
  ShiftStockSummary,
  VarianceStatus,
} from '../../shared/types';
import { parseMilliunits, formatMilliunits, MILLIUNIT_SCALE } from '../../shared/precision';

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
      .select({
        mapping: schema.outletProducts,
        product: schema.products,
      })
      .from(schema.outletProducts)
      .innerJoin(schema.products, eq(schema.outletProducts.productId, schema.products.id))
      .where(and(eq(schema.outletProducts.outletId, outletId), eq(schema.outletProducts.productId, productId)));

    if (!row) return null;
    return {
      id: row.mapping.id,
      outletId: row.mapping.outletId,
      productId: row.mapping.productId,
      status: row.mapping.status as 'ACTIVE' | 'INACTIVE',
      createdAt: row.mapping.createdAt,
      createdBy: row.mapping.createdBy,
      product: row.product as Product,
    };
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
    return (await this.findOutletProduct(data.outletId, data.productId))!;
  }

  async updateOutletProductStatus(outletId: string, productId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<OutletProduct | null> {
    await this.db
      .update(schema.outletProducts)
      .set({ status })
      .where(and(eq(schema.outletProducts.outletId, outletId), eq(schema.outletProducts.productId, productId)));
    return this.findOutletProduct(outletId, productId);
  }

  async findActiveTanksAndNozzlesForOutletProduct(outletId: string, productId: string): Promise<{ tanksCount: number; nozzlesCount: number }> {
    const [tanksResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tanks)
      .where(and(eq(schema.tanks.outletId, outletId), eq(schema.tanks.productId, productId), eq(schema.tanks.status, 'ACTIVE')));

    const [nozzlesResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.nozzles)
      .where(and(eq(schema.nozzles.outletId, outletId), eq(schema.nozzles.productId, productId), eq(schema.nozzles.status, 'ACTIVE')));

    return {
      tanksCount: Number(tanksResult?.count || 0),
      nozzlesCount: Number(nozzlesResult?.count || 0),
    };
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
    const [row] = await this.db
      .select({
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.tanks)
      .innerJoin(schema.products, eq(schema.tanks.productId, schema.products.id))
      .where(and(eq(schema.tanks.outletId, outletId), eq(schema.tanks.tankNumber, tankNumber)));

    if (!row) return null;
    return {
      ...row.tank,
      status: row.tank.status as any,
      productName: row.product.name,
      productCode: row.product.code,
    };
  }

  async findNozzlesReferencingTank(tankId: string): Promise<Nozzle[]> {
    const rows = await this.db.select().from(schema.nozzles).where(eq(schema.nozzles.tankId, tankId));
    return rows as Nozzle[];
  }

  async findActiveNozzlesReferencingTank(tankId: string): Promise<Nozzle[]> {
    const rows = await this.db
      .select()
      .from(schema.nozzles)
      .where(and(eq(schema.nozzles.tankId, tankId), eq(schema.nozzles.status, 'ACTIVE')));
    return rows as Nozzle[];
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

  async findActiveNozzlesByDispenser(dispenserId: string): Promise<Nozzle[]> {
    const rows = await this.db
      .select()
      .from(schema.nozzles)
      .where(and(eq(schema.nozzles.dispenserId, dispenserId), eq(schema.nozzles.status, 'ACTIVE')));
    return rows as Nozzle[];
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
  // 7. OPERATIONAL SHIFTS & SNAPSHOTS
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

  async findActiveOperationalShift(outletId: string): Promise<OperationalShift | null> {
    const [row] = await this.db
      .select()
      .from(schema.operationalShifts)
      .where(
        and(
          eq(schema.operationalShifts.outletId, outletId),
          inArray(schema.operationalShifts.status, ['OPEN', 'CLOSING'])
        )
      );
    return (row as OperationalShift) || null;
  }

  async findActiveOpenShift(outletId: string): Promise<OperationalShift | null> {
    return this.findActiveOperationalShift(outletId);
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

  /**
   * Opens an operational shift and snapshots all participating active nozzles atomically.
   */
  async openOperationalShiftWithSnapshot(data: {
    id: string;
    outletId: string;
    shiftTemplateId: string;
    businessDate: string;
    startedAt: string;
    openedByUserId: string;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<{ success: boolean; shift: OperationalShift | null; snapshotsCount: number; error?: string; message?: string }> {
    // 1. Resolve all participating active nozzles with active dispensers, active tanks, active products, and active outlet_products mappings
    const activeParticipatingNozzles = await this.db
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
      .innerJoin(
        schema.outletProducts,
        and(
          eq(schema.outletProducts.outletId, schema.nozzles.outletId),
          eq(schema.outletProducts.productId, schema.nozzles.productId)
        )
      )
      .where(
        and(
          eq(schema.nozzles.outletId, data.outletId),
          eq(schema.nozzles.status, 'ACTIVE'),
          eq(schema.dispensers.status, 'ACTIVE'),
          eq(schema.dispensers.outletId, data.outletId),
          eq(schema.tanks.status, 'ACTIVE'),
          eq(schema.tanks.outletId, data.outletId),
          eq(schema.tanks.productId, schema.nozzles.productId),
          eq(schema.products.status, 'ACTIVE'),
          eq(schema.outletProducts.status, 'ACTIVE')
        )
      );

    // 1b. Resolve participating active liquid tanks
    const activeParticipatingTanks = await this.db
      .select({
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.tanks)
      .innerJoin(schema.products, eq(schema.tanks.productId, schema.products.id))
      .innerJoin(
        schema.outletProducts,
        and(
          eq(schema.outletProducts.outletId, schema.tanks.outletId),
          eq(schema.outletProducts.productId, schema.tanks.productId)
        )
      )
      .where(
        and(
          eq(schema.tanks.outletId, data.outletId),
          eq(schema.tanks.status, 'ACTIVE'),
          eq(schema.products.status, 'ACTIVE'),
          eq(schema.products.unit, 'LITRE'),
          eq(schema.outletProducts.status, 'ACTIVE')
        )
      );

    // 1c. Resolve applicable product prices for products in the nozzle snapshot
    const productIds = Array.from(new Set(activeParticipatingNozzles.map(n => n.product.id)));
    const prices = await this.db
      .select()
      .from(schema.outletProductPrices)
      .where(
        and(
          eq(schema.outletProductPrices.outletId, data.outletId),
          inArray(schema.outletProductPrices.productId, productIds),
          eq(schema.outletProductPrices.status, 'ACTIVE'),
          lte(schema.outletProductPrices.effectiveFrom, data.businessDate),
          sql`(${schema.outletProductPrices.effectiveTo} IS NULL OR ${schema.outletProductPrices.effectiveTo} >= ${data.businessDate})`
        )
      )
      .orderBy(desc(schema.outletProductPrices.effectiveFrom));

    const resolvedPrices = new Map<string, typeof prices[0]>();
    prices.forEach(p => {
      if (!resolvedPrices.has(p.productId)) {
        resolvedPrices.set(p.productId, p);
      }
    });

    if (resolvedPrices.size < productIds.length) {
      return {
        success: false,
        shift: null,
        snapshotsCount: 0,
        error: 'PRODUCT_PRICE_NOT_CONFIGURED',
        message: 'One or more products in this shift do not have a configured active price for the business date.',
      };
    }

    // 2. Prevent empty operational shifts
    if (activeParticipatingNozzles.length === 0) {
      return {
        success: false,
        shift: null,
        snapshotsCount: 0,
        error: 'NO_OPERATIONAL_NOZZLES',
        message: 'No operational active nozzles with valid active dependencies exist to open a shift.',
      };
    }

    // 3. Prepare shift insert
    const shiftInsert = this.db.insert(schema.operationalShifts).values({
      id: data.id,
      outletId: data.outletId,
      shiftTemplateId: data.shiftTemplateId,
      businessDate: data.businessDate,
      startedAt: data.startedAt,
      status: 'OPEN',
      openedByUserId: data.openedByUserId,
      closedAt: null,
      closedByUserId: null,
      notes: data.notes || null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });

    // 4. Atomically insert shift, nozzle snapshots, and tank snapshots together
    const snapshotRows = activeParticipatingNozzles.map(n => ({
      id: `osn-${crypto.randomUUID()}`,
      operationalShiftId: data.id,
      outletId: data.outletId,
      nozzleId: n.nozzle.id,
      dispenserId: n.dispenser.id,
      dispenserNumber: n.dispenser.dispenserNumber,
      dispenserName: n.dispenser.name,
      nozzleNumber: n.nozzle.nozzleNumber,
      productId: n.product.id,
      productCode: n.product.code,
      productName: n.product.name,
      productCategory: n.product.category,
      productUnit: n.product.unit as ProductUnit,
      tankId: n.tank.id,
      tankNumber: n.tank.tankNumber,
      snapshotStatus: 'ACTIVE',
      createdAt: data.createdAt,
    }));

    const tankSnapshotRows = activeParticipatingTanks.map(t => ({
      id: `ost-${crypto.randomUUID()}`,
      operationalShiftId: data.id,
      outletId: data.outletId,
      tankId: t.tank.id,
      tankNumber: t.tank.tankNumber,
      tankName: t.tank.name,
      productId: t.product.id,
      productCode: t.product.code,
      productName: t.product.name,
      productUnit: t.product.unit as ProductUnit,
      capacityMilliunits: Math.round(t.tank.capacityLitres * MILLIUNIT_SCALE),
      safeFillCapacityMilliunits: Math.round(t.tank.safeFillCapacityLitres * MILLIUNIT_SCALE),
      createdAt: data.createdAt,
    }));

    const priceSnapshotRows = activeParticipatingNozzles.map(n => {
      const p = resolvedPrices.get(n.product.id)!;
      return {
        id: `ospp-${crypto.randomUUID()}`,
        operationalShiftId: data.id,
        outletId: data.outletId,
        productId: n.product.id,
        productCode: n.product.code,
        productName: n.product.name,
        unit: n.product.unit,
        pricePaisePerUnit: p.pricePaisePerUnit,
        sourcePriceId: p.id,
        createdAt: data.createdAt,
      };
    }).filter((v, i, a) => a.findIndex(t => t.productId === v.productId) === i);

    const nozzleSnapshotInsert = this.db.insert(schema.operationalShiftNozzles).values(snapshotRows);
    const priceSnapshotInsert = this.db.insert(schema.operationalShiftProductPrices).values(priceSnapshotRows);
    
    const batch: any[] = [shiftInsert, nozzleSnapshotInsert, priceSnapshotInsert];
    if (tankSnapshotRows.length > 0) {
      batch.push(this.db.insert(schema.operationalShiftTanks).values(tankSnapshotRows));
    }

    await (this.db as any).batch(batch);

    const shift = (await this.findOperationalShiftById(data.id))!;
    return { success: true, shift, snapshotsCount: activeParticipatingNozzles.length };
  }

  async listShiftNozzleSnapshots(shiftId: string): Promise<OperationalShiftNozzleSnapshot[]> {
    const rows = await this.db
      .select()
      .from(schema.operationalShiftNozzles)
      .where(eq(schema.operationalShiftNozzles.operationalShiftId, shiftId))
      .orderBy(schema.operationalShiftNozzles.dispenserNumber, schema.operationalShiftNozzles.nozzleNumber);

    return rows as OperationalShiftNozzleSnapshot[];
  }

  async findShiftNozzleSnapshot(shiftId: string, nozzleId: string): Promise<OperationalShiftNozzleSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.operationalShiftNozzles)
      .where(
        and(
          eq(schema.operationalShiftNozzles.operationalShiftId, shiftId),
          eq(schema.operationalShiftNozzles.nozzleId, nozzleId)
        )
      );
    return (row as OperationalShiftNozzleSnapshot) || null;
  }

  async listShiftTankSnapshots(shiftId: string): Promise<OperationalShiftTankSnapshot[]> {
    const rows = await this.db
      .select()
      .from(schema.operationalShiftTanks)
      .where(eq(schema.operationalShiftTanks.operationalShiftId, shiftId))
      .orderBy(schema.operationalShiftTanks.tankNumber);

    return rows.map(r => ({
      ...r,
      productUnit: r.productUnit as ProductUnit,
      capacityLitresStr: formatMilliunits(r.capacityMilliunits),
      safeFillLitresStr: formatMilliunits(r.safeFillCapacityMilliunits),
    }));
  }

  async findShiftTankSnapshot(shiftId: string, tankId: string): Promise<OperationalShiftTankSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.operationalShiftTanks)
      .where(
        and(
          eq(schema.operationalShiftTanks.operationalShiftId, shiftId),
          eq(schema.operationalShiftTanks.tankId, tankId)
        )
      );
    if (!row) return null;
    return {
      ...row,
      productUnit: row.productUnit as ProductUnit,
      capacityLitresStr: formatMilliunits(row.capacityMilliunits),
      safeFillLitresStr: formatMilliunits(row.safeFillCapacityMilliunits),
    };
  }

  async validateShiftCompleteness(shiftId: string): Promise<{
    valid: boolean;
    error?: string;
    message?: string;
    details?: Record<string, unknown>;
  }> {
    const existing = await this.findOperationalShiftById(shiftId);
    if (!existing) {
      return { valid: false, error: 'NOT_FOUND', message: 'Shift not found' };
    }

    // 1. Check all participating liquid tanks in shift snapshot
    const tankSnapshots = await this.listShiftTankSnapshots(shiftId);
    const tankReadings = await this.listShiftTankReadings(shiftId);

    if (tankSnapshots.length > 0) {
      for (const ts of tankSnapshots) {
        const hasOpening = tankReadings.some(r => r.tankId === ts.tankId && r.readingType === 'OPENING');
        const hasClosing = tankReadings.some(r => r.tankId === ts.tankId && r.readingType === 'CLOSING');

        if (!hasOpening || !hasClosing) {
          const missingReadingTypes: ('OPENING' | 'CLOSING')[] = [];
          if (!hasOpening) missingReadingTypes.push('OPENING');
          if (!hasClosing) missingReadingTypes.push('CLOSING');

          return {
            valid: false,
            error: 'INCOMPLETE_TANK_STOCK_DATA',
            message: `Tank #${ts.tankNumber} (${ts.tankName}) is missing ${missingReadingTypes.join(' and ')} stock reading(s).`,
            details: {
              tankId: ts.tankId,
              tankNumber: ts.tankNumber,
              missingReadingTypes,
            },
          };
        }
      }
    }

    // 2. Check all fuel receipts for this shift are terminal (COMPLETED or CANCELLED)
    const receipts = await this.listFuelReceiptsByShift(shiftId);
    for (const rcpt of receipts) {
      if (rcpt.status !== 'COMPLETED' && rcpt.status !== 'CANCELLED') {
        return {
          valid: false,
          error: 'INCOMPLETE_RECEIPTS',
          message: `Fuel receipt (TT: ${rcpt.ttNumber}, Inv: ${rcpt.invoiceNumber}) is in ${rcpt.status} status. Complete or cancel all fuel receipts before closing the shift.`,
        };
      }

      if (rcpt.status === 'COMPLETED' && rcpt.lines) {
        for (const line of rcpt.lines) {
          if (!line.preDecantReadingId || !line.postDecantReadingId) {
            return {
              valid: false,
              error: 'INCOMPLETE_DECANTATION_DATA',
              message: `Completed fuel receipt line for tank #${line.tankNumber || line.tankId} is missing PRE or POST decantation reading.`,
            };
          }

          const pre = tankReadings.find(r => r.id === line.preDecantReadingId);
          const post = tankReadings.find(r => r.id === line.postDecantReadingId);

          if (!pre || pre.readingType !== 'PRE_RECEIPT' || pre.operationalShiftId !== shiftId || pre.tankId !== line.tankId || pre.productId !== line.productId) {
            return {
              valid: false,
              error: 'INVALID_DECANTATION_READING',
              message: `PRE reading linked to receipt line is invalid or from a different shift/tank/product.`,
            };
          }

          if (!post || post.readingType !== 'POST_RECEIPT' || post.operationalShiftId !== shiftId || post.tankId !== line.tankId || post.productId !== line.productId) {
            return {
              valid: false,
              error: 'INVALID_DECANTATION_READING',
              message: `POST reading linked to receipt line is invalid or from a different shift/tank/product.`,
            };
          }

          if (post.recordedAt <= pre.recordedAt) {
            return {
              valid: false,
              error: 'INVALID_DECANTATION_TIMESTAMPS',
              message: `POST decantation reading timestamp must be strictly after PRE reading timestamp.`,
            };
          }

          const measured = post.netProductVolumeMilliunits - pre.netProductVolumeMilliunits;
          if (measured < 0) {
            return {
              valid: false,
              error: 'INVALID_DECANTATION_VOLUME',
              message: `Measured received volume (${measured / 1000} L) cannot be negative.`,
            };
          }
        }
      }
    }

    return { valid: true };
  }

  async closeOperationalShiftConditional(shiftId: string, closedByUserId: string): Promise<{ success: boolean; shift: OperationalShift | null; alreadyClosed: boolean; error?: string; message?: string; details?: Record<string, unknown> }> {
    const nowIso = new Date().toISOString();

    // 1. Conditional transition OPEN -> CLOSING
    const transitionToClosing = await this.db.all<{ id: string }>(
      sql`UPDATE operational_shifts
          SET status = 'CLOSING', updated_at = ${nowIso}
          WHERE id = ${shiftId} AND status = 'OPEN'
          RETURNING id`
    );

    if (!transitionToClosing || transitionToClosing.length === 0) {
      const latest = await this.findOperationalShiftById(shiftId);
      return {
        success: false,
        shift: latest,
        alreadyClosed: true,
        error: 'SHIFT_CLOSED_OR_CLOSING',
        message: 'Shift is already closing, closed, or locked',
      };
    }

    // 2. Centralized shift completeness validation in CLOSING state
    const check = await this.validateShiftCompleteness(shiftId);
    if (!check.valid) {
      // Revert status CLOSING -> OPEN on validation error
      await this.db.run(
        sql`UPDATE operational_shifts SET status = 'OPEN', updated_at = ${nowIso} WHERE id = ${shiftId} AND status = 'CLOSING'`
      );
      const current = await this.findOperationalShiftById(shiftId);
      return {
        success: false,
        shift: current,
        alreadyClosed: false,
        error: check.error,
        message: check.message,
        details: check.details,
      };
    }

    // 3. Calculate and save stock reconciliation in CLOSING state
    try {
      await this.calculateAndSaveShiftStockReconciliation(shiftId);
    } catch (err: any) {
      // Revert status CLOSING -> OPEN on reconciliation error
      await this.db.run(
        sql`UPDATE operational_shifts SET status = 'OPEN', updated_at = ${nowIso} WHERE id = ${shiftId} AND status = 'CLOSING'`
      );
      const current = await this.findOperationalShiftById(shiftId);
      return {
        success: false,
        shift: current,
        alreadyClosed: false,
        error: err?.code || 'RECONCILIATION_FAILED',
        message: err?.message || 'Failed to compute stock reconciliation',
      };
    }

    // 4. Final transition CLOSING -> CLOSED
    const transitionToClosed = await this.db.all<{ id: string; status: string }>(
      sql`UPDATE operational_shifts 
          SET status = 'CLOSED', closed_at = ${nowIso}, closed_by_user_id = ${closedByUserId}, updated_at = ${nowIso} 
          WHERE id = ${shiftId} AND status = 'CLOSING' 
          RETURNING id, status`
    );

    if (!transitionToClosed || transitionToClosed.length === 0) {
      const latest = await this.findOperationalShiftById(shiftId);
      return {
        success: false,
        shift: latest,
        alreadyClosed: true,
        error: 'SHIFT_CLOSED_OR_CLOSING',
        message: 'Shift is already closing or closed',
      };
    }

    const shift = await this.findOperationalShiftById(shiftId);
    return { success: true, shift, alreadyClosed: false };
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
    const r = rows[0].reading;
    const openingMilli = r.openingTotalizerMilliunits;
    const closingMilli = r.closingTotalizerMilliunits;
    const testingMilli = r.testingQuantityMilliunits;
    const grossMilli = r.grossSalesQuantityMilliunits;
    const netMilli = r.netSalesQuantityMilliunits;
    const varMilli = r.openingVarianceMilliunits;

    return {
      ...r,
      openingTotalizer: openingMilli / MILLIUNIT_SCALE,
      closingTotalizer: closingMilli / MILLIUNIT_SCALE,
      testingQuantity: testingMilli / MILLIUNIT_SCALE,
      grossSalesQuantity: grossMilli / MILLIUNIT_SCALE,
      netSalesQuantity: netMilli / MILLIUNIT_SCALE,
      openingTotalizerMilliunits: openingMilli,
      closingTotalizerMilliunits: closingMilli,
      testingQuantityMilliunits: testingMilli,
      grossSalesQuantityMilliunits: grossMilli,
      netSalesQuantityMilliunits: netMilli,
      openingVarianceMilliunits: varMilli,
      openingTotalizerStr: formatMilliunits(openingMilli),
      closingTotalizerStr: formatMilliunits(closingMilli),
      testingQuantityStr: formatMilliunits(testingMilli),
      grossSalesQuantityStr: formatMilliunits(grossMilli),
      netSalesQuantityStr: formatMilliunits(netMilli),
      openingVarianceStr: formatMilliunits(varMilli),
      hasOpeningVariance: Boolean(r.hasOpeningVariance),
      openingVarianceQuantity: varMilli / MILLIUNIT_SCALE,
    };
  }

  async listReadingsForShift(shiftId: string): Promise<NozzleMeterReading[]> {
    const rows = await this.db
      .select({
        reading: schema.nozzleMeterReadings,
        user: schema.users,
      })
      .from(schema.nozzleMeterReadings)
      .innerJoin(schema.users, eq(schema.nozzleMeterReadings.recordedByUserId, schema.users.id))
      .where(eq(schema.nozzleMeterReadings.operationalShiftId, shiftId));

    return rows.map(r => {
      const rd = r.reading;
      const openingMilli = rd.openingTotalizerMilliunits;
      const closingMilli = rd.closingTotalizerMilliunits;
      const testingMilli = rd.testingQuantityMilliunits;
      const grossMilli = rd.grossSalesQuantityMilliunits;
      const netMilli = rd.netSalesQuantityMilliunits;
      const varMilli = rd.openingVarianceMilliunits;

      return {
        ...rd,
        openingTotalizer: openingMilli / MILLIUNIT_SCALE,
        closingTotalizer: closingMilli / MILLIUNIT_SCALE,
        testingQuantity: testingMilli / MILLIUNIT_SCALE,
        grossSalesQuantity: grossMilli / MILLIUNIT_SCALE,
        netSalesQuantity: netMilli / MILLIUNIT_SCALE,
        openingTotalizerMilliunits: openingMilli,
        closingTotalizerMilliunits: closingMilli,
        testingQuantityMilliunits: testingMilli,
        grossSalesQuantityMilliunits: grossMilli,
        netSalesQuantityMilliunits: netMilli,
        openingVarianceMilliunits: varMilli,
        openingTotalizerStr: formatMilliunits(openingMilli),
        closingTotalizerStr: formatMilliunits(closingMilli),
        testingQuantityStr: formatMilliunits(testingMilli),
        grossSalesQuantityStr: formatMilliunits(grossMilli),
        netSalesQuantityStr: formatMilliunits(netMilli),
        openingVarianceStr: formatMilliunits(varMilli),
        hasOpeningVariance: Boolean(rd.hasOpeningVariance),
        openingVarianceQuantity: varMilli / MILLIUNIT_SCALE,
        recorderName: r.user.name,
      };
    });
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

    const openingMilli = row.openingTotalizerMilliunits;
    const closingMilli = row.closingTotalizerMilliunits;
    const testingMilli = row.testingQuantityMilliunits;
    const grossMilli = row.grossSalesQuantityMilliunits;
    const netMilli = row.netSalesQuantityMilliunits;
    const varMilli = row.openingVarianceMilliunits;

    return {
      ...row,
      openingTotalizer: openingMilli / MILLIUNIT_SCALE,
      closingTotalizer: closingMilli / MILLIUNIT_SCALE,
      testingQuantity: testingMilli / MILLIUNIT_SCALE,
      grossSalesQuantity: grossMilli / MILLIUNIT_SCALE,
      netSalesQuantity: netMilli / MILLIUNIT_SCALE,
      openingTotalizerMilliunits: openingMilli,
      closingTotalizerMilliunits: closingMilli,
      testingQuantityMilliunits: testingMilli,
      grossSalesQuantityMilliunits: grossMilli,
      netSalesQuantityMilliunits: netMilli,
      openingVarianceMilliunits: varMilli,
      openingTotalizerStr: formatMilliunits(openingMilli),
      closingTotalizerStr: formatMilliunits(closingMilli),
      testingQuantityStr: formatMilliunits(testingMilli),
      grossSalesQuantityStr: formatMilliunits(grossMilli),
      netSalesQuantityStr: formatMilliunits(netMilli),
      openingVarianceStr: formatMilliunits(varMilli),
      hasOpeningVariance: Boolean(row.hasOpeningVariance),
      openingVarianceQuantity: varMilli / MILLIUNIT_SCALE,
    };
  }

  async createReading(data: {
    id: string;
    operationalShiftId: string;
    outletId: string;
    nozzleId: string;
    openingMilliunits: number;
    closingMilliunits: number;
    testingMilliunits: number;
    grossMilliunits: number;
    netMilliunits: number;
    recordedByUserId: string;
    hasOpeningVariance: boolean;
    openingVarianceMilliunits: number;
    varianceReason: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<{ reading: NozzleMeterReading | null; shiftClosed: boolean }> {
    const hasVarianceNum = data.hasOpeningVariance ? 1 : 0;
    const inserted = await this.db.all<{ id: string }>(
      sql`INSERT INTO nozzle_meter_readings (
        id, operational_shift_id, outlet_id, nozzle_id,
        opening_totalizer_milliunits, closing_totalizer_milliunits, testing_quantity_milliunits,
        gross_sales_quantity_milliunits, net_sales_quantity_milliunits, opening_variance_milliunits,
        recorded_by_user_id, has_opening_variance, variance_reason, created_at, updated_at
      )
      SELECT
        ${data.id}, ${data.operationalShiftId}, ${data.outletId}, ${data.nozzleId},
        ${data.openingMilliunits}, ${data.closingMilliunits}, ${data.testingMilliunits},
        ${data.grossMilliunits}, ${data.netMilliunits}, ${data.openingVarianceMilliunits},
        ${data.recordedByUserId}, ${hasVarianceNum}, ${data.varianceReason}, ${data.createdAt}, ${data.updatedAt}
      WHERE EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${data.operationalShiftId} AND status = 'OPEN')
      RETURNING id`
    );

    if (!inserted || inserted.length === 0) {
      const shift = await this.findOperationalShiftById(data.operationalShiftId);
      if (shift && shift.status !== 'OPEN') {
        return { reading: null, shiftClosed: true };
      }
      return { reading: null, shiftClosed: false };
    }

    const reading = await this.findReadingByShiftAndNozzle(data.operationalShiftId, data.nozzleId);
    return { reading, shiftClosed: false };
  }

  async updateReading(shiftId: string, nozzleId: string, data: {
    openingMilliunits: number;
    closingMilliunits: number;
    testingMilliunits: number;
    grossMilliunits: number;
    netMilliunits: number;
    hasOpeningVariance: boolean;
    openingVarianceMilliunits: number;
    varianceReason: string | null;
    updatedAt: string;
  }): Promise<{ reading: NozzleMeterReading | null; shiftClosed: boolean }> {
    const hasVarianceNum = data.hasOpeningVariance ? 1 : 0;
    const updated = await this.db.all<{ id: string }>(
      sql`UPDATE nozzle_meter_readings
          SET
            opening_totalizer_milliunits = ${data.openingMilliunits},
            closing_totalizer_milliunits = ${data.closingMilliunits},
            testing_quantity_milliunits = ${data.testingMilliunits},
            gross_sales_quantity_milliunits = ${data.grossMilliunits},
            net_sales_quantity_milliunits = ${data.netMilliunits},
            has_opening_variance = ${hasVarianceNum},
            opening_variance_milliunits = ${data.openingVarianceMilliunits},
            variance_reason = ${data.varianceReason},
            updated_at = ${data.updatedAt}
          WHERE operational_shift_id = ${shiftId} AND nozzle_id = ${nozzleId}
            AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${shiftId} AND status = 'OPEN')
          RETURNING id`
    );

    if (!updated || updated.length === 0) {
      const shift = await this.findOperationalShiftById(shiftId);
      if (shift && shift.status !== 'OPEN') {
        return { reading: null, shiftClosed: true };
      }
      return { reading: null, shiftClosed: false };
    }

    const reading = await this.findReadingByShiftAndNozzle(shiftId, nozzleId);
    return { reading, shiftClosed: false };
  }

  // ==========================================
  // 9. NOZZLE UNAVAILABILITY RECORDS
  // ==========================================

  async listUnavailabilityForShift(shiftId: string): Promise<NozzleUnavailabilityRecord[]> {
    const rows = await this.db
      .select({
        record: schema.nozzleUnavailabilityRecords,
        user: schema.users,
      })
      .from(schema.nozzleUnavailabilityRecords)
      .innerJoin(schema.users, eq(schema.nozzleUnavailabilityRecords.recordedBy, schema.users.id))
      .where(eq(schema.nozzleUnavailabilityRecords.operationalShiftId, shiftId));

    return rows.map(r => ({
      ...r.record,
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
  }): Promise<{ record: NozzleUnavailabilityRecord | null; shiftClosed: boolean }> {
    const inserted = await this.db.all<{ id: string }>(
      sql`INSERT INTO nozzle_unavailability_records (
        id, operational_shift_id, nozzle_id, reason, recorded_by, created_at
      )
      SELECT
        ${data.id}, ${data.operationalShiftId}, ${data.nozzleId}, ${data.reason}, ${data.recordedBy}, ${data.createdAt}
      WHERE EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${data.operationalShiftId} AND status = 'OPEN')
      RETURNING id`
    );

    if (!inserted || inserted.length === 0) {
      const shift = await this.findOperationalShiftById(data.operationalShiftId);
      if (shift && shift.status !== 'OPEN') {
        return { record: null, shiftClosed: true };
      }
      return { record: null, shiftClosed: false };
    }

    const record = await this.findUnavailability(data.operationalShiftId, data.nozzleId);
    return { record, shiftClosed: false };
  }

  async removeUnavailability(shiftId: string, nozzleId: string): Promise<{ success: boolean; shiftClosed: boolean }> {
    const deleted = await this.db.all<{ id: string }>(
      sql`DELETE FROM nozzle_unavailability_records
          WHERE operational_shift_id = ${shiftId} AND nozzle_id = ${nozzleId}
            AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${shiftId} AND status = 'OPEN')
          RETURNING id`
    );

    if (!deleted || deleted.length === 0) {
      const shift = await this.findOperationalShiftById(shiftId);
      if (shift && shift.status !== 'OPEN') {
        return { success: false, shiftClosed: true };
      }
      return { success: false, shiftClosed: false };
    }

    return { success: true, shiftClosed: false };
  }

  // ==========================================
  // 10. SHIFT ENTRY GRID (USING HISTORICAL SNAPSHOT)
  // ==========================================

  async getShiftEntryGrid(shiftId: string): Promise<ShiftEntryGridItem[]> {
    const shift = await this.findOperationalShiftById(shiftId);
    if (!shift) return [];

    // CRITICAL: Retrieve participating nozzles from historical snapshot!
    const snapshots = await this.listShiftNozzleSnapshots(shiftId);
    const readings = await this.listReadingsForShift(shiftId);
    const unavails = await this.listUnavailabilityForShift(shiftId);

    const readingMap = new Map<string, NozzleMeterReading>();
    readings.forEach(r => readingMap.set(r.nozzleId, r));

    const unavailMap = new Map<string, NozzleUnavailabilityRecord>();
    unavails.forEach(u => unavailMap.set(u.nozzleId, u));

    const grid: ShiftEntryGridItem[] = [];

    for (const snapshot of snapshots) {
      const reading = readingMap.get(snapshot.nozzleId) || null;
      const unavail = unavailMap.get(snapshot.nozzleId) || null;

      const prevReading = await this.getLatestClosedReadingForNozzle(snapshot.nozzleId);
      const suggestedOpeningTotalizer = prevReading ? prevReading.closingTotalizerStr : '0.000';

      grid.push({
        snapshot,
        reading,
        unavailability: unavail,
        suggestedOpeningTotalizer,
        hasPreviousShift: prevReading !== null,
      });
    }

    return grid;
  }

  // ==========================================
  // 11. AUTHORITATIVE SALES SUMMARY (USING HISTORICAL SNAPSHOT & EXACT SCALED INTEGERS)
  // ==========================================

  async getSalesSummary(shiftId: string): Promise<ShiftSalesSummary | null> {
    const shift = await this.findOperationalShiftById(shiftId);
    if (!shift) return null;

    // CRITICAL: Must use the shift snapshot, NOT current master!
    const snapshots = await this.listShiftNozzleSnapshots(shiftId);
    const readings = await this.listReadingsForShift(shiftId);
    const unavails = await this.listUnavailabilityForShift(shiftId);

    const readingMap = new Map<string, NozzleMeterReading>();
    readings.forEach(r => readingMap.set(r.nozzleId, r));

    const unavailMap = new Map<string, NozzleUnavailabilityRecord>();
    unavails.forEach(u => unavailMap.set(u.nozzleId, u));

    // Per nozzle aggregation
    const byNozzle: ShiftSalesSummary['byNozzle'] = [];
    for (const snap of snapshots) {
      const r = readingMap.get(snap.nozzleId);
      const u = unavailMap.get(snap.nozzleId);

      const grossMilli = r ? (r.grossSalesQuantityMilliunits ?? (r.closingTotalizerMilliunits! - r.openingTotalizerMilliunits!)) : 0;
      const testMilli = r ? (r.testingQuantityMilliunits ?? 0) : 0;
      const netMilli = r ? (r.netSalesQuantityMilliunits ?? (grossMilli - testMilli)) : 0;
      const varMilli = r ? (r.openingVarianceMilliunits ?? 0) : 0;

      byNozzle.push({
        nozzleId: snap.nozzleId,
        nozzleNumber: snap.nozzleNumber,
        dispenserId: snap.dispenserId,
        dispenserNumber: snap.dispenserNumber,
        dispenserName: snap.dispenserName,
        productId: snap.productId,
        productCode: snap.productCode,
        productName: snap.productName,
        productCategory: snap.productCategory,
        unit: snap.productUnit,
        openingTotalizerStr: r ? r.openingTotalizerStr : null,
        closingTotalizerStr: r ? r.closingTotalizerStr : null,
        grossQuantity: formatMilliunits(grossMilli),
        testingQuantity: formatMilliunits(testMilli),
        netQuantity: formatMilliunits(netMilli),
        openingTotalizer: r ? (r.openingTotalizerMilliunits ?? 0) / MILLIUNIT_SCALE : null,
        closingTotalizer: r ? (r.closingTotalizerMilliunits ?? 0) / MILLIUNIT_SCALE : null,
        isUnavailable: Boolean(u),
        unavailableReason: u ? u.reason : null,
        hasVariance: r ? Boolean(r.hasOpeningVariance) : false,
        varianceQuantity: formatMilliunits(varMilli),
      });
    }

    // Per dispenser aggregation
    const dispenserMap = new Map<string, {
      dispenserId: string;
      dispenserNumber: number;
      name: string;
      unitMap: Map<ProductUnit, { gross: number; test: number; net: number }>;
    }>();

    for (const item of byNozzle) {
      let d = dispenserMap.get(item.dispenserId);
      if (!d) {
        d = {
          dispenserId: item.dispenserId,
          dispenserNumber: item.dispenserNumber,
          name: item.dispenserName || `Dispenser #${item.dispenserNumber}`,
          unitMap: new Map(),
        };
        dispenserMap.set(item.dispenserId, d);
      }

      const r = readingMap.get(item.nozzleId);
      const grossMilli = r ? (r.grossSalesQuantityMilliunits ?? 0) : 0;
      const testMilli = r ? (r.testingQuantityMilliunits ?? 0) : 0;
      const netMilli = r ? (r.netSalesQuantityMilliunits ?? 0) : 0;

      let uData = d.unitMap.get(item.unit);
      if (!uData) {
        uData = { gross: 0, test: 0, net: 0 };
        d.unitMap.set(item.unit, uData);
      }
      uData.gross += grossMilli;
      uData.test += testMilli;
      uData.net += netMilli;
    }

    const byDispenser = Array.from(dispenserMap.values()).map(d => ({
      dispenserId: d.dispenserId,
      dispenserNumber: d.dispenserNumber,
      name: d.name,
      totalsByUnit: Array.from(d.unitMap.entries()).map(([unit, totals]) => ({
        unit,
        grossQuantity: formatMilliunits(totals.gross),
        testingQuantity: formatMilliunits(totals.test),
        netQuantity: formatMilliunits(totals.net),
      })),
    })).sort((a, b) => a.dispenserNumber - b.dispenserNumber);

    // By product aggregation
    const productMap = new Map<string, {
      productId: string;
      productCode: string;
      productName: string;
      productCategory: string;
      unit: ProductUnit;
      grossMilli: number;
      testMilli: number;
      netMilli: number;
    }>();

    for (const snap of snapshots) {
      let p = productMap.get(snap.productId);
      if (!p) {
        p = {
          productId: snap.productId,
          productCode: snap.productCode,
          productName: snap.productName,
          productCategory: snap.productCategory,
          unit: snap.productUnit,
          grossMilli: 0,
          testMilli: 0,
          netMilli: 0,
        };
        productMap.set(snap.productId, p);
      }

      const r = readingMap.get(snap.nozzleId);
      if (r) {
        p.grossMilli += r.grossSalesQuantityMilliunits ?? 0;
        p.testMilli += r.testingQuantityMilliunits ?? 0;
        p.netMilli += r.netSalesQuantityMilliunits ?? 0;
      }
    }

    const byProduct = Array.from(productMap.values()).map(p => ({
      productId: p.productId,
      productCode: p.productCode,
      productName: p.productName,
      productCategory: p.productCategory,
      unit: p.unit,
      grossQuantity: formatMilliunits(p.grossMilli),
      testingQuantity: formatMilliunits(p.testMilli),
      netQuantity: formatMilliunits(p.netMilli),
    }));

    // Overall Totals Grouped By Physical Unit (NEVER merge Litres and KG)
    const overallUnitMap = new Map<ProductUnit, { gross: number; test: number; net: number }>();
    for (const p of productMap.values()) {
      let u = overallUnitMap.get(p.unit);
      if (!u) {
        u = { gross: 0, test: 0, net: 0 };
        overallUnitMap.set(p.unit, u);
      }
      u.gross += p.grossMilli;
      u.test += p.testMilli;
      u.net += p.netMilli;
    }

    const totalsByUnit: UnitQuantitySummary[] = Array.from(overallUnitMap.entries()).map(([unit, t]) => ({
      unit,
      grossQuantity: formatMilliunits(t.gross),
      testingQuantity: formatMilliunits(t.test),
      netQuantity: formatMilliunits(t.net),
    }));

    return {
      operationalShiftId: shift.id,
      businessDate: shift.businessDate,
      status: shift.status,
      outletId: shift.outletId,
      byNozzle,
      byDispenser,
      byProduct,
      totalsByUnit,
    };
  }

  // ==========================================
  // PHASE 2B: TANK CALIBRATION POINTS
  // ==========================================

  async listCalibrationPoints(tankId: string): Promise<TankCalibrationPoint[]> {
    const rows = await this.db
      .select()
      .from(schema.tankCalibrationPoints)
      .where(eq(schema.tankCalibrationPoints.tankId, tankId))
      .orderBy(asc(schema.tankCalibrationPoints.dipMillimetresMilliunits));

    return rows.map(r => ({
      ...r,
      dipMmStr: formatMilliunits(r.dipMillimetresMilliunits),
      volumeLitreStr: formatMilliunits(r.volumeMilliunits),
    }));
  }

  async findCalibrationPointById(id: string): Promise<TankCalibrationPoint | null> {
    const [row] = await this.db.select().from(schema.tankCalibrationPoints).where(eq(schema.tankCalibrationPoints.id, id));
    if (!row) return null;
    return {
      ...row,
      dipMmStr: formatMilliunits(row.dipMillimetresMilliunits),
      volumeLitreStr: formatMilliunits(row.volumeMilliunits),
    };
  }

  async createCalibrationPoint(data: {
    id: string;
    tankId: string;
    dipMillimetresMilliunits: number;
    volumeMilliunits: number;
    createdAt: string;
    createdBy: string;
  }): Promise<TankCalibrationPoint> {
    await this.db.insert(schema.tankCalibrationPoints).values(data);
    return (await this.findCalibrationPointById(data.id))!;
  }

  async updateCalibrationPoint(id: string, data: Partial<{
    dipMillimetresMilliunits: number;
    volumeMilliunits: number;
  }>): Promise<TankCalibrationPoint | null> {
    await this.db.update(schema.tankCalibrationPoints).set(data).where(eq(schema.tankCalibrationPoints.id, id));
    return this.findCalibrationPointById(id);
  }

  async deleteCalibrationPoint(id: string): Promise<boolean> {
    await this.db.delete(schema.tankCalibrationPoints).where(eq(schema.tankCalibrationPoints.id, id));
    return true;
  }

  async bulkImportCalibrationPoints(
    tankId: string,
    points: Array<{ dipMillimetresMilliunits: number; volumeMilliunits: number }>,
    createdBy: string
  ): Promise<TankCalibrationPoint[]> {
    const nowIso = new Date().toISOString();
    const sorted = [...points].sort((a, b) => a.dipMillimetresMilliunits - b.dipMillimetresMilliunits);

    // Validate monotonicity
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].dipMillimetresMilliunits === sorted[i + 1].dipMillimetresMilliunits) {
        throw new Error(`Duplicate dip height ${formatMilliunits(sorted[i].dipMillimetresMilliunits)} mm in calibration chart`);
      }
      if (sorted[i].volumeMilliunits > sorted[i + 1].volumeMilliunits) {
        throw new Error(
          `Non-monotonic calibration chart: volume ${formatMilliunits(sorted[i].volumeMilliunits)} L at ${formatMilliunits(sorted[i].dipMillimetresMilliunits)} mm is greater than volume ${formatMilliunits(sorted[i + 1].volumeMilliunits)} L at ${formatMilliunits(sorted[i + 1].dipMillimetresMilliunits)} mm`
        );
      }
    }

    const deleteStmt = this.db.delete(schema.tankCalibrationPoints).where(eq(schema.tankCalibrationPoints.tankId, tankId));
    const insertRows = sorted.map(p => ({
      id: `tcp-${crypto.randomUUID()}`,
      tankId,
      dipMillimetresMilliunits: p.dipMillimetresMilliunits,
      volumeMilliunits: p.volumeMilliunits,
      createdAt: nowIso,
      createdBy,
    }));

    const insertStmt = this.db.insert(schema.tankCalibrationPoints).values(insertRows);
    await (this.db as any).batch([deleteStmt, insertStmt]);

    return this.listCalibrationPoints(tankId);
  }

  // ==========================================
  // PHASE 2B: TANK STOCK READINGS
  // ==========================================

  async listShiftTankReadings(shiftId: string): Promise<TankStockReading[]> {
    const rows = await this.db
      .select({
        reading: schema.tankStockReadings,
        tank: schema.tanks,
        product: schema.products,
        user: schema.users,
      })
      .from(schema.tankStockReadings)
      .innerJoin(schema.tanks, eq(schema.tankStockReadings.tankId, schema.tanks.id))
      .innerJoin(schema.products, eq(schema.tankStockReadings.productId, schema.products.id))
      .innerJoin(schema.users, eq(schema.tankStockReadings.recordedByUserId, schema.users.id))
      .where(eq(schema.tankStockReadings.operationalShiftId, shiftId))
      .orderBy(asc(schema.tankStockReadings.recordedAt), asc(schema.tanks.tankNumber));

    return rows.map(r => ({
      ...r.reading,
      readingType: r.reading.readingType as TankReadingType,
      source: r.reading.source as TankReadingSource,
      productDipMmStr: formatMilliunits(r.reading.productDipMmMilliunits),
      waterDipMmStr: formatMilliunits(r.reading.waterDipMmMilliunits),
      grossObservedVolumeStr: formatMilliunits(r.reading.grossObservedVolumeMilliunits),
      waterVolumeStr: formatMilliunits(r.reading.waterVolumeMilliunits),
      netProductVolumeStr: formatMilliunits(r.reading.netProductVolumeMilliunits),
      tankNumber: r.tank.tankNumber,
      tankName: r.tank.name,
      productCode: r.product.code,
      productName: r.product.name,
      recorderName: r.user.name,
    }));
  }

  async findTankReadingById(id: string): Promise<TankStockReading | null> {
    const [row] = await this.db
      .select({
        reading: schema.tankStockReadings,
        tank: schema.tanks,
        product: schema.products,
        user: schema.users,
      })
      .from(schema.tankStockReadings)
      .innerJoin(schema.tanks, eq(schema.tankStockReadings.tankId, schema.tanks.id))
      .innerJoin(schema.products, eq(schema.tankStockReadings.productId, schema.products.id))
      .innerJoin(schema.users, eq(schema.tankStockReadings.recordedByUserId, schema.users.id))
      .where(eq(schema.tankStockReadings.id, id));

    if (!row) return null;
    return {
      ...row.reading,
      readingType: row.reading.readingType as TankReadingType,
      source: row.reading.source as TankReadingSource,
      productDipMmStr: formatMilliunits(row.reading.productDipMmMilliunits),
      waterDipMmStr: formatMilliunits(row.reading.waterDipMmMilliunits),
      grossObservedVolumeStr: formatMilliunits(row.reading.grossObservedVolumeMilliunits),
      waterVolumeStr: formatMilliunits(row.reading.waterVolumeMilliunits),
      netProductVolumeStr: formatMilliunits(row.reading.netProductVolumeMilliunits),
      tankNumber: row.tank.tankNumber,
      tankName: row.tank.name,
      productCode: row.product.code,
      productName: row.product.name,
      recorderName: row.user.name,
    };
  }

  async findShiftTankReadingByType(shiftId: string, tankId: string, readingType: TankReadingType): Promise<TankStockReading | null> {
    const [row] = await this.db
      .select()
      .from(schema.tankStockReadings)
      .where(
        and(
          eq(schema.tankStockReadings.operationalShiftId, shiftId),
          eq(schema.tankStockReadings.tankId, tankId),
          eq(schema.tankStockReadings.readingType, readingType)
        )
      );
    if (!row) return null;
    return this.findTankReadingById(row.id);
  }

  async findPreviousShiftClosingStock(
    outletId: string,
    tankId: string,
    beforeStartedAt?: string
  ): Promise<{ closingStockMilliunits: number; closingStockStr: string; shiftId: string; businessDate: string } | null> {
    const rows = await this.db
      .select({
        reading: schema.tankStockReadings,
        shift: schema.operationalShifts,
      })
      .from(schema.tankStockReadings)
      .innerJoin(schema.operationalShifts, eq(schema.tankStockReadings.operationalShiftId, schema.operationalShifts.id))
      .where(
        and(
          eq(schema.tankStockReadings.outletId, outletId),
          eq(schema.tankStockReadings.tankId, tankId),
          eq(schema.tankStockReadings.readingType, 'CLOSING'),
          eq(schema.operationalShifts.status, 'CLOSED')
        )
      )
      .orderBy(desc(schema.operationalShifts.businessDate), desc(schema.operationalShifts.startedAt))
      .limit(1);

    if (!rows || rows.length === 0) return null;
    const item = rows[0];
    return {
      closingStockMilliunits: item.reading.netProductVolumeMilliunits,
      closingStockStr: formatMilliunits(item.reading.netProductVolumeMilliunits),
      shiftId: item.shift.id,
      businessDate: item.shift.businessDate,
    };
  }

  async createTankReadingConditional(data: {
    id: string;
    operationalShiftId: string;
    outletId: string;
    tankId: string;
    productId: string;
    readingType: TankReadingType;
    source: TankReadingSource;
    productDipMmMilliunits: number;
    waterDipMmMilliunits: number;
    grossObservedVolumeMilliunits: number;
    waterVolumeMilliunits: number;
    netProductVolumeMilliunits: number;
    recordedAt: string;
    recordedByUserId: string;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<{ success: boolean; reading: TankStockReading | null; shiftClosed?: boolean; conflict?: boolean; error?: string }> {
    const insertedRows = await this.db.all<{ id: string }>(
      sql`INSERT INTO tank_stock_readings (
            id, operational_shift_id, outlet_id, tank_id, product_id,
            reading_type, source, product_dip_mm_milliunits, water_dip_mm_milliunits,
            gross_observed_volume_milliunits, water_volume_milliunits, net_product_volume_milliunits,
            recorded_at, recorded_by_user_id, notes, created_at, updated_at
          )
          SELECT 
            ${data.id}, ${data.operationalShiftId}, ${data.outletId}, ${data.tankId}, ${data.productId},
            ${data.readingType}, ${data.source}, ${data.productDipMmMilliunits}, ${data.waterDipMmMilliunits},
            ${data.grossObservedVolumeMilliunits}, ${data.waterVolumeMilliunits}, ${data.netProductVolumeMilliunits},
            ${data.recordedAt}, ${data.recordedByUserId}, ${data.notes || null}, ${data.createdAt}, ${data.updatedAt}
          WHERE EXISTS (
            SELECT 1 FROM operational_shifts WHERE id = ${data.operationalShiftId} AND status = 'OPEN'
          )
          RETURNING id`
    );

    if (!insertedRows || insertedRows.length === 0) {
      const shift = await this.findOperationalShiftById(data.operationalShiftId);
      if (!shift || shift.status !== 'OPEN') {
        return { success: false, reading: null, shiftClosed: true, error: 'SHIFT_CLOSED' };
      }
      return { success: false, reading: null, conflict: true, error: 'CONFLICT' };
    }

    const reading = await this.findTankReadingById(data.id);
    return { success: true, reading };
  }

  async createTankReading(data: {
    id: string;
    operationalShiftId: string;
    outletId: string;
    tankId: string;
    productId: string;
    readingType: TankReadingType;
    source: TankReadingSource;
    productDipMmMilliunits: number;
    waterDipMmMilliunits: number;
    grossObservedVolumeMilliunits: number;
    waterVolumeMilliunits: number;
    netProductVolumeMilliunits: number;
    recordedAt: string;
    recordedByUserId: string;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<TankStockReading> {
    const res = await this.createTankReadingConditional(data);
    if (!res.success || !res.reading) {
      throw new Error(res.error || 'Failed to create tank reading');
    }
    return res.reading;
  }

  // ==========================================
  // PHASE 2B: FUEL RECEIPTS & TANK LINES
  // ==========================================

  async listFuelReceiptsByShift(shiftId: string): Promise<FuelReceipt[]> {
    const receiptRows = await this.db
      .select({
        receipt: schema.fuelReceipts,
        user: schema.users,
      })
      .from(schema.fuelReceipts)
      .innerJoin(schema.users, eq(schema.fuelReceipts.recordedByUserId, schema.users.id))
      .where(eq(schema.fuelReceipts.operationalShiftId, shiftId))
      .orderBy(desc(schema.fuelReceipts.createdAt));

    const lineRows = await this.db
      .select({
        line: schema.fuelReceiptTankLines,
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.fuelReceiptTankLines)
      .innerJoin(schema.tanks, eq(schema.fuelReceiptTankLines.tankId, schema.tanks.id))
      .innerJoin(schema.products, eq(schema.fuelReceiptTankLines.productId, schema.products.id))
      .innerJoin(schema.fuelReceipts, eq(schema.fuelReceiptTankLines.fuelReceiptId, schema.fuelReceipts.id))
      .where(eq(schema.fuelReceipts.operationalShiftId, shiftId));

    const lineMap = new Map<string, FuelReceiptTankLine[]>();
    for (const l of lineRows) {
      const arr = lineMap.get(l.line.fuelReceiptId) || [];
      arr.push({
        ...l.line,
        qualityStatus: l.line.qualityStatus as QualityStatus,
        invoiceQuantityStr: formatMilliunits(l.line.invoiceQuantityMilliunits),
        measuredReceivedQuantityStr: l.line.measuredReceivedQuantityMilliunits != null ? formatMilliunits(l.line.measuredReceivedQuantityMilliunits) : null,
        receiptVarianceStr: l.line.receiptVarianceMilliunits != null ? formatMilliunits(l.line.receiptVarianceMilliunits) : null,
        densityStr: l.line.densityMilliunits != null ? formatMilliunits(l.line.densityMilliunits) : null,
        temperatureStr: l.line.temperatureMilliunits != null ? formatMilliunits(l.line.temperatureMilliunits) : null,
        invoiceDensityStr: l.line.invoiceDensityMilliunits != null ? formatMilliunits(l.line.invoiceDensityMilliunits) : null,
        densityVarianceStr: l.line.densityVarianceMilliunits != null ? formatMilliunits(l.line.densityVarianceMilliunits) : null,
        tankNumber: l.tank.tankNumber,
        tankName: l.tank.name,
        productCode: l.product.code,
        productName: l.product.name,
      });
      lineMap.set(l.line.fuelReceiptId, arr);
    }

    return receiptRows.map(r => ({
      ...r.receipt,
      status: r.receipt.status as FuelReceiptStatus,
      sealVerified: Boolean(r.receipt.sealVerified),
      lines: lineMap.get(r.receipt.id) || [],
      recorderName: r.user.name,
    }));
  }

  async findFuelReceiptById(id: string): Promise<FuelReceipt | null> {
    const [row] = await this.db
      .select({
        receipt: schema.fuelReceipts,
        user: schema.users,
      })
      .from(schema.fuelReceipts)
      .innerJoin(schema.users, eq(schema.fuelReceipts.recordedByUserId, schema.users.id))
      .where(eq(schema.fuelReceipts.id, id));

    if (!row) return null;

    const lineRows = await this.db
      .select({
        line: schema.fuelReceiptTankLines,
        tank: schema.tanks,
        product: schema.products,
      })
      .from(schema.fuelReceiptTankLines)
      .innerJoin(schema.tanks, eq(schema.fuelReceiptTankLines.tankId, schema.tanks.id))
      .innerJoin(schema.products, eq(schema.fuelReceiptTankLines.productId, schema.products.id))
      .where(eq(schema.fuelReceiptTankLines.fuelReceiptId, id));

    const lines: FuelReceiptTankLine[] = lineRows.map(l => ({
      ...l.line,
      qualityStatus: l.line.qualityStatus as QualityStatus,
      invoiceQuantityStr: formatMilliunits(l.line.invoiceQuantityMilliunits),
      measuredReceivedQuantityStr: l.line.measuredReceivedQuantityMilliunits != null ? formatMilliunits(l.line.measuredReceivedQuantityMilliunits) : null,
      receiptVarianceStr: l.line.receiptVarianceMilliunits != null ? formatMilliunits(l.line.receiptVarianceMilliunits) : null,
      densityStr: l.line.densityMilliunits != null ? formatMilliunits(l.line.densityMilliunits) : null,
      temperatureStr: l.line.temperatureMilliunits != null ? formatMilliunits(l.line.temperatureMilliunits) : null,
      invoiceDensityStr: l.line.invoiceDensityMilliunits != null ? formatMilliunits(l.line.invoiceDensityMilliunits) : null,
      densityVarianceStr: l.line.densityVarianceMilliunits != null ? formatMilliunits(l.line.densityVarianceMilliunits) : null,
      tankNumber: l.tank.tankNumber,
      tankName: l.tank.name,
      productCode: l.product.code,
      productName: l.product.name,
    }));

    return {
      ...row.receipt,
      status: row.receipt.status as FuelReceiptStatus,
      sealVerified: Boolean(row.receipt.sealVerified),
      lines,
      recorderName: row.user.name,
    };
  }

  async createFuelReceiptConditional(
    receiptData: {
      id: string;
      outletId: string;
      operationalShiftId: string;
      ttNumber: string;
      invoiceNumber: string;
      invoiceDate: string;
      arrivalAt: string;
      sealVerified: boolean;
      sealExceptionReason?: string | null;
      recordedByUserId: string;
      createdAt: string;
      updatedAt: string;
    },
    linesData: Array<{
      id: string;
      fuelReceiptId: string;
      tankId: string;
      productId: string;
      invoiceQuantityMilliunits: number;
      densityMilliunits?: number | null;
      temperatureMilliunits?: number | null;
      invoiceDensityMilliunits?: number | null;
      densityVarianceMilliunits?: number | null;
      qualityStatus: QualityStatus;
      appliedToleranceSettingId?: string | null;
      appliedDensityToleranceMilliunits?: number | null;
      createdAt: string;
      updatedAt: string;
    }>
  ): Promise<{ success: boolean; receipt: FuelReceipt | null; shiftClosed?: boolean; error?: string }> {
    const sealVerifiedNum = receiptData.sealVerified ? 1 : 0;

    const [shift] = await this.db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, receiptData.operationalShiftId));
    if (!shift || shift.status !== 'OPEN') {
      return { success: false, receipt: null, shiftClosed: true, error: 'SHIFT_CLOSED' };
    }

    const conditionalHeaderInsert = this.db.insert(schema.fuelReceipts).select(
      this.db.select({
        id: sql<string>`${receiptData.id}`.as('id'),
        outletId: sql<string>`${receiptData.outletId}`.as('outletId'),
        operationalShiftId: schema.operationalShifts.id,
        ttNumber: sql<string>`${receiptData.ttNumber}`.as('ttNumber'),
        invoiceNumber: sql<string>`${receiptData.invoiceNumber}`.as('invoiceNumber'),
        invoiceDate: sql<string>`${receiptData.invoiceDate}`.as('invoiceDate'),
        arrivalAt: sql<string>`${receiptData.arrivalAt}`.as('arrivalAt'),
        decantationStartedAt: sql<string | null>`null`.as('decantation_started_at'),
        decantationCompletedAt: sql<string | null>`null`.as('decantation_completed_at'),
        sealVerified: sql<boolean>`${sealVerifiedNum === 1}`.as('seal_verified'),
        sealExceptionReason: sql<string | null>`${receiptData.sealExceptionReason || null}`.as('seal_exception_reason'),
        status: sql<string>`'ARRIVED'`.as('status'),
        recordedByUserId: sql<string>`${receiptData.recordedByUserId}`.as('recorded_by_user_id'),
        createdAt: sql<string>`${receiptData.createdAt}`.as('created_at'),
        updatedAt: sql<string>`${receiptData.updatedAt}`.as('updated_at'),
      })
      .from(schema.operationalShifts)
      .where(and(
        eq(schema.operationalShifts.id, receiptData.operationalShiftId),
        eq(schema.operationalShifts.status, 'OPEN')
      ))
    ).returning({ id: schema.fuelReceipts.id });

    const lineInserts = linesData.map(line =>
      this.db.insert(schema.fuelReceiptTankLines).values({
        id: line.id,
        fuelReceiptId: receiptData.id,
        tankId: line.tankId,
        productId: line.productId,
        invoiceQuantityMilliunits: line.invoiceQuantityMilliunits,
        densityMilliunits: line.densityMilliunits || null,
        temperatureMilliunits: line.temperatureMilliunits || null,
        invoiceDensityMilliunits: line.invoiceDensityMilliunits || null,
        densityVarianceMilliunits: line.densityVarianceMilliunits || null,
        qualityStatus: line.qualityStatus,
        appliedToleranceSettingId: line.appliedToleranceSettingId || null,
        appliedDensityToleranceMilliunits: line.appliedDensityToleranceMilliunits || null,
        createdAt: line.createdAt,
        updatedAt: line.updatedAt,
      }).returning({ id: schema.fuelReceiptTankLines.id })
    );

    try {
      await (this.db as any).batch([conditionalHeaderInsert, ...lineInserts]);
    } catch (err: any) {
      const [currentShift] = await this.db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, receiptData.operationalShiftId));
      if (!currentShift || currentShift.status !== 'OPEN') {
        return { success: false, receipt: null, shiftClosed: true, error: 'SHIFT_CLOSED' };
      }
      return { success: false, receipt: null, shiftClosed: false, error: 'RECEIPT_CREATE_FAILED' };
    }

    const created = await this.findFuelReceiptById(receiptData.id);
    if (!created) {
      const [currentShift] = await this.db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, receiptData.operationalShiftId));
      if (!currentShift || currentShift.status !== 'OPEN') {
        return { success: false, receipt: null, shiftClosed: true, error: 'SHIFT_CLOSED' };
      }
      return { success: false, receipt: null, shiftClosed: false, error: 'RECEIPT_CREATE_FAILED' };
    }
    return { success: true, receipt: created };
  }

  async updateFuelReceiptStatusConditional(
    id: string,
    shiftId: string,
    data: Partial<{
      status: FuelReceiptStatus;
      decantationStartedAt: string | null;
      decantationCompletedAt: string | null;
      sealVerified: boolean;
      sealExceptionReason: string | null;
      updatedAt: string;
    }>,
    expectedCurrentStatus?: FuelReceiptStatus | null
  ): Promise<{ success: boolean; receipt: FuelReceipt | null; shiftClosed?: boolean; finalized?: boolean; error?: string }> {
    const nowIso = new Date().toISOString();
    const updatedRows = await this.db.all<{ id: string }>(
      sql`UPDATE fuel_receipts
          SET status = COALESCE(${data.status || null}, status),
              decantation_started_at = COALESCE(${data.decantationStartedAt || null}, decantation_started_at),
              decantation_completed_at = COALESCE(${data.decantationCompletedAt || null}, decantation_completed_at),
              seal_verified = COALESCE(${data.sealVerified !== undefined ? (data.sealVerified ? 1 : 0) : null}, seal_verified),
              seal_exception_reason = COALESCE(${data.sealExceptionReason || null}, seal_exception_reason),
              updated_at = ${nowIso}
          WHERE id = ${id} AND operational_shift_id = ${shiftId}
            AND status NOT IN ('COMPLETED', 'CANCELLED')
            ${expectedCurrentStatus ? sql`AND status = ${expectedCurrentStatus}` : sql``}
            AND EXISTS (SELECT 1 FROM operational_shifts WHERE id = ${shiftId} AND status = 'OPEN')
          RETURNING id`
    );

    if (!updatedRows || updatedRows.length === 0) {
      const existing = await this.findFuelReceiptById(id);
      if (existing && (existing.status === 'COMPLETED' || existing.status === 'CANCELLED')) {
        return { success: false, receipt: existing, finalized: true, error: 'RECEIPT_FINALIZED' };
      }
      if (existing && expectedCurrentStatus && existing.status !== expectedCurrentStatus) {
        return { success: false, receipt: existing, error: 'RECEIPT_STATE_CHANGED' };
      }
      const [shift] = await this.db.select().from(schema.operationalShifts).where(eq(schema.operationalShifts.id, shiftId));
      if (!shift || shift.status !== 'OPEN') {
        return { success: false, receipt: existing || null, shiftClosed: true, error: 'SHIFT_CLOSED' };
      }
      return { success: false, receipt: existing || null, error: 'RECEIPT_STATE_CHANGED' };
    }

    const updated = await this.findFuelReceiptById(id);
    return { success: true, receipt: updated };
  }

  async updateFuelReceiptLineConditional(
    lineId: string,
    shiftId: string,
    data: Partial<{
      preDecantReadingId: string | null;
      postDecantReadingId: string | null;
      measuredReceivedQuantityMilliunits: number | null;
      receiptVarianceMilliunits: number | null;
      densityMilliunits: number | null;
      temperatureMilliunits: number | null;
      invoiceDensityMilliunits: number | null;
      densityVarianceMilliunits: number | null;
      qualityStatus: QualityStatus;
      appliedToleranceSettingId: string | null;
      appliedDensityToleranceMilliunits: number | null;
      updatedAt: string;
    }>
  ): Promise<{ success: boolean; line: FuelReceiptTankLine | null; shiftClosed?: boolean; finalized?: boolean; error?: string }> {
    const nowIso = new Date().toISOString();
    const updatedRows = await this.db.all<{ id: string }>(
      sql`UPDATE fuel_receipt_tank_lines
          SET pre_decant_reading_id = COALESCE(${data.preDecantReadingId !== undefined ? data.preDecantReadingId : null}, pre_decant_reading_id),
              post_decant_reading_id = COALESCE(${data.postDecantReadingId !== undefined ? data.postDecantReadingId : null}, post_decant_reading_id),
              measured_received_quantity_milliunits = COALESCE(${data.measuredReceivedQuantityMilliunits != null ? data.measuredReceivedQuantityMilliunits : null}, measured_received_quantity_milliunits),
              receipt_variance_milliunits = COALESCE(${data.receiptVarianceMilliunits != null ? data.receiptVarianceMilliunits : null}, receipt_variance_milliunits),
              density_milliunits = COALESCE(${data.densityMilliunits != null ? data.densityMilliunits : null}, density_milliunits),
              temperature_milliunits = COALESCE(${data.temperatureMilliunits != null ? data.temperatureMilliunits : null}, temperature_milliunits),
              invoice_density_milliunits = COALESCE(${data.invoiceDensityMilliunits != null ? data.invoiceDensityMilliunits : null}, invoice_density_milliunits),
              density_variance_milliunits = COALESCE(${data.densityVarianceMilliunits != null ? data.densityVarianceMilliunits : null}, density_variance_milliunits),
              quality_status = COALESCE(${data.qualityStatus || null}, quality_status),
              applied_tolerance_setting_id = COALESCE(${data.appliedToleranceSettingId || null}, applied_tolerance_setting_id),
              applied_density_tolerance_milliunits = COALESCE(${data.appliedDensityToleranceMilliunits != null ? data.appliedDensityToleranceMilliunits : null}, applied_density_tolerance_milliunits),
              updated_at = ${nowIso}
          WHERE id = ${lineId}
            AND EXISTS (
              SELECT 1 FROM fuel_receipts fr
              INNER JOIN operational_shifts os ON fr.operational_shift_id = os.id
              WHERE fr.id = fuel_receipt_tank_lines.fuel_receipt_id
                AND os.id = ${shiftId}
                AND fr.status NOT IN ('COMPLETED', 'CANCELLED')
                AND os.status = 'OPEN'
            )
          RETURNING id`
    );

    if (!updatedRows || updatedRows.length === 0) {
      const [lineRow] = await this.db.select().from(schema.fuelReceiptTankLines).where(eq(schema.fuelReceiptTankLines.id, lineId));
      if (lineRow) {
        const parentReceipt = await this.findFuelReceiptById(lineRow.fuelReceiptId);
        if (parentReceipt && (parentReceipt.status === 'COMPLETED' || parentReceipt.status === 'CANCELLED')) {
          return { success: false, line: null, finalized: true, error: 'RECEIPT_FINALIZED' };
        }
      }
      return { success: false, line: null, shiftClosed: true, error: 'SHIFT_CLOSED' };
    }

    const [lineRow] = await this.db.select().from(schema.fuelReceiptTankLines).where(eq(schema.fuelReceiptTankLines.id, lineId));
    if (!lineRow) return { success: false, line: null, error: 'NOT_FOUND' };

    const [tank] = await this.db.select().from(schema.tanks).where(eq(schema.tanks.id, lineRow.tankId));
    const [product] = await this.db.select().from(schema.products).where(eq(schema.products.id, lineRow.productId));

    const line: FuelReceiptTankLine = {
      ...lineRow,
      qualityStatus: lineRow.qualityStatus as QualityStatus,
      invoiceQuantityStr: formatMilliunits(lineRow.invoiceQuantityMilliunits),
      measuredReceivedQuantityStr: lineRow.measuredReceivedQuantityMilliunits != null ? formatMilliunits(lineRow.measuredReceivedQuantityMilliunits) : null,
      receiptVarianceStr: lineRow.receiptVarianceMilliunits != null ? formatMilliunits(lineRow.receiptVarianceMilliunits) : null,
      densityStr: lineRow.densityMilliunits != null ? formatMilliunits(lineRow.densityMilliunits) : null,
      temperatureStr: lineRow.temperatureMilliunits != null ? formatMilliunits(lineRow.temperatureMilliunits) : null,
      invoiceDensityStr: lineRow.invoiceDensityMilliunits != null ? formatMilliunits(lineRow.invoiceDensityMilliunits) : null,
      densityVarianceStr: lineRow.densityVarianceMilliunits != null ? formatMilliunits(lineRow.densityVarianceMilliunits) : null,
      tankNumber: tank?.tankNumber || 0,
      tankName: tank?.name || '',
      productCode: product?.code || '',
      productName: product?.name || '',
    };

    return { success: true, line };
  }

  // ==========================================
  // PHASE 2B: QUALITY TOLERANCE SETTINGS
  // ==========================================

  async listQualityTolerances(scopeType?: QualityScopeType, scopeEntityId?: string | null): Promise<QualityToleranceSetting[]> {
    const conditions: any[] = [];
    if (scopeType) {
      conditions.push(eq(schema.qualityToleranceSettings.scopeType, scopeType));
    }
    if (scopeEntityId !== undefined && scopeEntityId !== null) {
      conditions.push(eq(schema.qualityToleranceSettings.scopeEntityId, scopeEntityId));
    }

    let query = this.db
      .select({
        tolerance: schema.qualityToleranceSettings,
        product: schema.products,
      })
      .from(schema.qualityToleranceSettings)
      .leftJoin(schema.products, eq(schema.qualityToleranceSettings.productId, schema.products.id));

    if (conditions.length > 0) {
      query = (query as any).where(and(...conditions));
    }

    const rows = await query.orderBy(desc(schema.qualityToleranceSettings.createdAt));

    return rows.map(r => ({
      ...r.tolerance,
      scopeType: r.tolerance.scopeType as QualityScopeType,
      densityToleranceStr: formatMilliunits(r.tolerance.densityToleranceMilliunits),
      productCode: r.product?.code,
      productName: r.product?.name,
    }));
  }

  async findQualityToleranceById(id: string): Promise<QualityToleranceSetting | null> {
    const [row] = await this.db
      .select({
        tolerance: schema.qualityToleranceSettings,
        product: schema.products,
      })
      .from(schema.qualityToleranceSettings)
      .leftJoin(schema.products, eq(schema.qualityToleranceSettings.productId, schema.products.id))
      .where(eq(schema.qualityToleranceSettings.id, id));

    if (!row) return null;
    return {
      ...row.tolerance,
      scopeType: row.tolerance.scopeType as QualityScopeType,
      densityToleranceStr: formatMilliunits(row.tolerance.densityToleranceMilliunits),
      productCode: row.product?.code,
      productName: row.product?.name,
    };
  }

  async createQualityTolerance(data: {
    id: string;
    scopeType: QualityScopeType;
    scopeEntityId?: string | null;
    productId?: string | null;
    densityToleranceMilliunits: number;
    status: 'ACTIVE' | 'INACTIVE';
    effectiveFrom: string;
    effectiveTo?: string | null;
    createdAt: string;
    createdBy: string;
  }): Promise<QualityToleranceSetting> {
    await this.db.insert(schema.qualityToleranceSettings).values(data);
    return (await this.findQualityToleranceById(data.id))!;
  }

  async updateQualityTolerance(id: string, data: Partial<{
    scopeType: QualityScopeType;
    scopeEntityId: string | null;
    productId: string | null;
    densityToleranceMilliunits: number;
    status: 'ACTIVE' | 'INACTIVE';
    effectiveFrom: string;
    effectiveTo: string | null;
  }>): Promise<QualityToleranceSetting | null> {
    await this.db.update(schema.qualityToleranceSettings).set(data).where(eq(schema.qualityToleranceSettings.id, id));
    return this.findQualityToleranceById(id);
  }

  async deleteQualityTolerance(id: string): Promise<boolean> {
    await this.db.delete(schema.qualityToleranceSettings).where(eq(schema.qualityToleranceSettings.id, id));
    return true;
  }

  // ==========================================
  // PHASE 2B: STOCK RECONCILIATION
  // ==========================================

  async calculateAndSaveShiftStockReconciliation(shiftId: string): Promise<ShiftStockReconciliation[]> {
    const shift = await this.findOperationalShiftById(shiftId);
    if (!shift) throw new Error('Shift not found');

    const tankSnapshots = await this.listShiftTankSnapshots(shiftId);
    const nozzleSnapshots = await this.listShiftNozzleSnapshots(shiftId);
    const tankReadings = await this.listShiftTankReadings(shiftId);
    const meterReadings = await this.listReadingsForShift(shiftId);
    const receipts = await this.listFuelReceiptsByShift(shiftId);

    for (const ts of tankSnapshots) {
      const hasOpening = tankReadings.some(r => r.tankId === ts.tankId && r.readingType === 'OPENING');
      const hasClosing = tankReadings.some(r => r.tankId === ts.tankId && r.readingType === 'CLOSING');
      if (!hasOpening || !hasClosing) {
        const err = new Error(`Cannot calculate stock reconciliation: Tank #${ts.tankNumber} (${ts.tankName}) missing OPENING or CLOSING reading.`) as any;
        err.code = 'INCOMPLETE_TANK_STOCK_DATA';
        throw err;
      }
    }

    const nowIso = new Date().toISOString();
    const reconResults: ShiftStockReconciliation[] = [];

    for (const ts of tankSnapshots) {
      const openingReading = tankReadings.find(r => r.tankId === ts.tankId && r.readingType === 'OPENING')!;
      const closingReading = tankReadings.find(r => r.tankId === ts.tankId && r.readingType === 'CLOSING')!;

      const openingStockMilli = openingReading.netProductVolumeMilliunits;
      const physicalClosingMilli = closingReading.netProductVolumeMilliunits;

      let receiptMilli = 0;
      for (const rcpt of receipts) {
        if (rcpt.status === 'COMPLETED' && rcpt.lines) {
          for (const line of rcpt.lines) {
            if (line.tankId === ts.tankId && line.measuredReceivedQuantityMilliunits != null) {
              receiptMilli += line.measuredReceivedQuantityMilliunits;
            }
          }
        }
      }

      let salesMilli = 0;
      const nozzlesForTank = nozzleSnapshots.filter(n => n.tankId === ts.tankId);
      for (const n of nozzlesForTank) {
        const mr = meterReadings.find(r => r.nozzleId === n.nozzleId);
        if (mr && mr.netSalesQuantityMilliunits != null) {
          salesMilli += mr.netSalesQuantityMilliunits;
        }
      }

      const theoreticalClosingMilli = openingStockMilli + receiptMilli - salesMilli;
      const varianceMilli = physicalClosingMilli - theoreticalClosingMilli;
      let varianceStatus: VarianceStatus = 'BALANCED';
      if (varianceMilli > 0) varianceStatus = 'GAIN';
      else if (varianceMilli < 0) varianceStatus = 'LOSS';

      const reconId = `ssr-${shiftId}-${ts.tankId}`;
      const reconData = {
        id: reconId,
        operationalShiftId: shiftId,
        outletId: shift.outletId,
        tankId: ts.tankId,
        productId: ts.productId,
        openingStockMilliunits: openingStockMilli,
        receiptQuantityMilliunits: receiptMilli,
        salesQuantityMilliunits: salesMilli,
        theoreticalClosingStockMilliunits: theoreticalClosingMilli,
        physicalClosingStockMilliunits: physicalClosingMilli,
        varianceMilliunits: varianceMilli,
        varianceStatus,
        calculatedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await this.db
        .insert(schema.shiftStockReconciliations)
        .values(reconData)
        .onConflictDoUpdate({
          target: [schema.shiftStockReconciliations.operationalShiftId, schema.shiftStockReconciliations.tankId],
          set: {
            openingStockMilliunits: openingStockMilli,
            receiptQuantityMilliunits: receiptMilli,
            salesQuantityMilliunits: salesMilli,
            theoreticalClosingStockMilliunits: theoreticalClosingMilli,
            physicalClosingStockMilliunits: physicalClosingMilli,
            varianceMilliunits: varianceMilli,
            varianceStatus,
            calculatedAt: nowIso,
            updatedAt: nowIso,
          },
        });

      reconResults.push({
        ...reconData,
        openingStockStr: formatMilliunits(openingStockMilli),
        receiptQuantityStr: formatMilliunits(receiptMilli),
        salesQuantityStr: formatMilliunits(salesMilli),
        theoreticalClosingStockStr: formatMilliunits(theoreticalClosingMilli),
        physicalClosingStockStr: formatMilliunits(physicalClosingMilli),
        varianceStr: formatMilliunits(varianceMilli),
        tankNumber: ts.tankNumber,
        tankName: ts.tankName,
        productCode: ts.productCode,
        productName: ts.productName,
        productUnit: ts.productUnit,
      });
    }

    return reconResults;
  }

  async getShiftStockSummary(shiftId: string): Promise<ShiftStockSummary> {
    const shift = await this.findOperationalShiftById(shiftId);
    if (!shift) throw new Error('Shift not found');

    const tankSnapshots = await this.listShiftTankSnapshots(shiftId);
    const nozzleSnapshots = await this.listShiftNozzleSnapshots(shiftId);
    const tankReadings = await this.listShiftTankReadings(shiftId);
    const meterReadings = await this.listReadingsForShift(shiftId);
    const receipts = await this.listFuelReceiptsByShift(shiftId);

    const byTank = tankSnapshots.map(ts => {
      const openingReading = tankReadings.find(r => r.tankId === ts.tankId && r.readingType === 'OPENING');
      const closingReading = tankReadings.find(r => r.tankId === ts.tankId && r.readingType === 'CLOSING');

      const hasOpeningReading = Boolean(openingReading);
      const hasClosingReading = Boolean(closingReading);

      const openingStockMilli = openingReading ? openingReading.netProductVolumeMilliunits : null;
      const physicalClosingMilli = closingReading ? closingReading.netProductVolumeMilliunits : null;

      let receiptMilli = 0;
      let rcptCount = 0;
      for (const rcpt of receipts) {
        if (rcpt.status === 'COMPLETED' && rcpt.lines) {
          for (const line of rcpt.lines) {
            if (line.tankId === ts.tankId && line.measuredReceivedQuantityMilliunits != null) {
              receiptMilli += line.measuredReceivedQuantityMilliunits;
              rcptCount++;
            }
          }
        }
      }

      let salesMilli = 0;
      const nozzlesForTank = nozzleSnapshots.filter(n => n.tankId === ts.tankId);
      for (const n of nozzlesForTank) {
        const mr = meterReadings.find(r => r.nozzleId === n.nozzleId);
        if (mr && mr.netSalesQuantityMilliunits != null) {
          salesMilli += mr.netSalesQuantityMilliunits;
        }
      }

      let theoreticalClosingMilli: number | null = null;
      if (openingStockMilli != null) {
        theoreticalClosingMilli = openingStockMilli + receiptMilli - salesMilli;
      }

      let varianceMilli: number | null = null;
      let varianceStatus: VarianceStatus | null = null;
      if (physicalClosingMilli != null && theoreticalClosingMilli != null) {
        varianceMilli = physicalClosingMilli - theoreticalClosingMilli;
        if (varianceMilli > 0) varianceStatus = 'GAIN';
        else if (varianceMilli < 0) varianceStatus = 'LOSS';
        else varianceStatus = 'BALANCED';
      }

      return {
        tankId: ts.tankId,
        tankNumber: ts.tankNumber,
        tankName: ts.tankName,
        productId: ts.productId,
        productCode: ts.productCode,
        productName: ts.productName,
        productUnit: ts.productUnit,
        openingStockStr: openingStockMilli != null ? formatMilliunits(openingStockMilli) : null,
        receiptQuantityStr: formatMilliunits(receiptMilli),
        salesQuantityStr: formatMilliunits(salesMilli),
        theoreticalClosingStockStr: theoreticalClosingMilli != null ? formatMilliunits(theoreticalClosingMilli) : null,
        physicalClosingStockStr: physicalClosingMilli != null ? formatMilliunits(physicalClosingMilli) : null,
        varianceStr: varianceMilli != null ? formatMilliunits(varianceMilli) : null,
        varianceStatus,
        hasOpeningReading,
        hasClosingReading,
        receiptsCount: rcptCount,
      };
    });

    const productMap = new Map<string, {
      productId: string;
      productCode: string;
      productName: string;
      productUnit: ProductUnit;
      openingMilli: number | null;
      receiptMilli: number;
      salesMilli: number;
      theoreticalMilli: number | null;
      physicalMilli: number | null;
      varianceMilli: number | null;
    }>();

    for (const item of byTank) {
      let p = productMap.get(item.productId);
      if (!p) {
        p = {
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          productUnit: item.productUnit,
          openingMilli: item.openingStockStr != null ? parseMilliunits(item.openingStockStr) : null,
          receiptMilli: parseMilliunits(item.receiptQuantityStr),
          salesMilli: parseMilliunits(item.salesQuantityStr),
          theoreticalMilli: item.theoreticalClosingStockStr != null ? parseMilliunits(item.theoreticalClosingStockStr) : null,
          physicalMilli: item.physicalClosingStockStr != null ? parseMilliunits(item.physicalClosingStockStr) : null,
          varianceMilli: item.varianceStr != null ? parseMilliunits(item.varianceStr) : null,
        };
        productMap.set(item.productId, p);
      } else {
        if (item.openingStockStr != null && p.openingMilli != null) {
          p.openingMilli += parseMilliunits(item.openingStockStr);
        } else {
          p.openingMilli = null;
        }
        p.receiptMilli += parseMilliunits(item.receiptQuantityStr);
        p.salesMilli += parseMilliunits(item.salesQuantityStr);
        if (item.theoreticalClosingStockStr != null && p.theoreticalMilli != null) {
          p.theoreticalMilli += parseMilliunits(item.theoreticalClosingStockStr);
        } else {
          p.theoreticalMilli = null;
        }
        if (item.physicalClosingStockStr != null && p.physicalMilli != null) {
          p.physicalMilli += parseMilliunits(item.physicalClosingStockStr);
        } else {
          p.physicalMilli = null;
        }
        if (item.varianceStr != null && p.varianceMilli != null) {
          p.varianceMilli += parseMilliunits(item.varianceStr);
        } else {
          p.varianceMilli = null;
        }
      }
    }

    const byProduct = Array.from(productMap.values()).map(p => {
      let varianceStatus: VarianceStatus | null = null;
      if (p.varianceMilli != null) {
        if (p.varianceMilli > 0) varianceStatus = 'GAIN';
        else if (p.varianceMilli < 0) varianceStatus = 'LOSS';
        else varianceStatus = 'BALANCED';
      }

      return {
        productId: p.productId,
        productCode: p.productCode,
        productName: p.productName,
        productUnit: p.productUnit,
        openingStockStr: p.openingMilli != null ? formatMilliunits(p.openingMilli) : null,
        receiptQuantityStr: formatMilliunits(p.receiptMilli),
        salesQuantityStr: formatMilliunits(p.salesMilli),
        theoreticalClosingStockStr: p.theoreticalMilli != null ? formatMilliunits(p.theoreticalMilli) : null,
        physicalClosingStockStr: p.physicalMilli != null ? formatMilliunits(p.physicalMilli) : null,
        varianceStr: p.varianceMilli != null ? formatMilliunits(p.varianceMilli) : null,
        varianceStatus,
      };
    });

    return {
      operationalShiftId: shift.id,
      businessDate: shift.businessDate,
      outletId: shift.outletId,
      byTank,
      byProduct,
    };
  }
}
