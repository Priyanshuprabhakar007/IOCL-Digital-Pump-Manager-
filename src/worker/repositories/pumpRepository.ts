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
  OperationalShiftNozzleSnapshot,
  NozzleMeterReading,
  NozzleUnavailabilityRecord,
  ShiftSalesSummary,
  ShiftEntryGridItem,
  UnitQuantitySummary,
  ProductUnit,
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

  async findActiveOpenShift(outletId: string): Promise<OperationalShift | null> {
    const [row] = await this.db
      .select()
      .from(schema.operationalShifts)
      .where(and(eq(schema.operationalShifts.outletId, outletId), eq(schema.operationalShifts.status, 'OPEN')));
    return (row as OperationalShift) || null;
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
  }): Promise<{ shift: OperationalShift; snapshotsCount: number }> {
    // 1. Resolve all participating active nozzles with active dispensers
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
      .where(
        and(
          eq(schema.nozzles.outletId, data.outletId),
          eq(schema.nozzles.status, 'ACTIVE'),
          eq(schema.dispensers.status, 'ACTIVE')
        )
      );

    // 2. Prepare shift insert
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

    // 3. Atomically insert shift and snapshot rows together
    if (activeParticipatingNozzles.length > 0) {
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

      const snapshotInsert = this.db.insert(schema.operationalShiftNozzles).values(snapshotRows);
      await (this.db as any).batch([shiftInsert, snapshotInsert]);
    } else {
      await shiftInsert;
    }

    const shift = (await this.findOperationalShiftById(data.id))!;
    return { shift, snapshotsCount: activeParticipatingNozzles.length };
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

  async closeOperationalShiftConditional(shiftId: string, closedByUserId: string): Promise<{ success: boolean; shift: OperationalShift | null; alreadyClosed: boolean }> {
    const nowIso = new Date().toISOString();
    // Conditional update: only updates if status is currently OPEN
    const updatedRows = await this.db.all<{ id: string; status: string }>(
      sql`UPDATE operational_shifts 
          SET status = 'CLOSED', closed_at = ${nowIso}, closed_by_user_id = ${closedByUserId}, updated_at = ${nowIso} 
          WHERE id = ${shiftId} AND status = 'OPEN' 
          RETURNING id, status`
    );

    if (!updatedRows || updatedRows.length === 0) {
      const existing = await this.findOperationalShiftById(shiftId);
      if (existing && (existing.status === 'CLOSED' || existing.status === 'LOCKED')) {
        return { success: false, shift: existing, alreadyClosed: true };
      }
      return { success: false, shift: existing, alreadyClosed: false };
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
}
