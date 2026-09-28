import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { RetailOutlet, OutletUserAssignment } from '../../shared/types';

export class OutletRepository {
  constructor(private db: AppDatabase) {}

  async listAllOutlets(): Promise<RetailOutlet[]> {
    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id));

    return res.map(r => ({
      ...r.outlet,
      stateName: r.stateName,
      divisionName: r.divisionName,
      salesAreaName: r.salesAreaName,
    }));
  }

  async findOutletsByIds(outletIds: string[]): Promise<RetailOutlet[]> {
    if (outletIds.length === 0) return [];

    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(inArray(schema.retailOutlets.id, outletIds));

    return res.map(r => ({
      ...r.outlet,
      stateName: r.stateName,
      divisionName: r.divisionName,
      salesAreaName: r.salesAreaName,
    }));
  }

  async findOutletsByStateIds(stateIds: string[]): Promise<RetailOutlet[]> {
    if (stateIds.length === 0) return [];

    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(inArray(schema.retailOutlets.stateId, stateIds));

    return res.map(r => ({
      ...r.outlet,
      stateName: r.stateName,
      divisionName: r.divisionName,
      salesAreaName: r.salesAreaName,
    }));
  }

  async findOutletsByDivisionIds(divisionIds: string[]): Promise<RetailOutlet[]> {
    if (divisionIds.length === 0) return [];

    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(inArray(schema.retailOutlets.divisionId, divisionIds));

    return res.map(r => ({
      ...r.outlet,
      stateName: r.stateName,
      divisionName: r.divisionName,
      salesAreaName: r.salesAreaName,
    }));
  }

  async findOutletsBySalesAreaIds(salesAreaIds: string[]): Promise<RetailOutlet[]> {
    if (salesAreaIds.length === 0) return [];

    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(inArray(schema.retailOutlets.salesAreaId, salesAreaIds));

    return res.map(r => ({
      ...r.outlet,
      stateName: r.stateName,
      divisionName: r.divisionName,
      salesAreaName: r.salesAreaName,
    }));
  }

  async findById(id: string): Promise<RetailOutlet | null> {
    const res = await this.db
      .select({
        outlet: schema.retailOutlets,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
      })
      .from(schema.retailOutlets)
      .innerJoin(schema.states, eq(schema.retailOutlets.stateId, schema.states.id))
      .innerJoin(schema.divisions, eq(schema.retailOutlets.divisionId, schema.divisions.id))
      .innerJoin(schema.salesAreas, eq(schema.retailOutlets.salesAreaId, schema.salesAreas.id))
      .where(eq(schema.retailOutlets.id, id))
      .limit(1);

    if (res.length === 0) return null;
    return {
      ...res[0].outlet,
      stateName: res[0].stateName,
      divisionName: res[0].divisionName,
      salesAreaName: res[0].salesAreaName,
    };
  }

  async createOutlet(data: {
    id: string;
    roCode: string;
    name: string;
    outletType: 'COCO' | 'DOCO' | 'DODO';
    stateId: string;
    divisionId: string;
    salesAreaId: string;
    address: string;
    city: string;
    district: string;
    pincode: string;
    latitude?: number | null;
    longitude?: number | null;
    status: 'ACTIVE' | 'INACTIVE';
    createdAt: string;
    updatedAt: string;
  }): Promise<RetailOutlet> {
    await this.db.insert(schema.retailOutlets).values({
      id: data.id,
      roCode: data.roCode,
      name: data.name,
      outletType: data.outletType,
      stateId: data.stateId,
      divisionId: data.divisionId,
      salesAreaId: data.salesAreaId,
      address: data.address,
      city: data.city,
      district: data.district,
      pincode: data.pincode,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });

    const created = await this.findById(data.id);
    if (!created) throw new Error('Failed to create retail outlet');
    return created;
  }

  async updateOutlet(id: string, data: Partial<{
    name: string;
    outletType: 'COCO' | 'DOCO' | 'DODO';
    address: string;
    city: string;
    district: string;
    pincode: string;
    latitude: number | null;
    longitude: number | null;
    status: 'ACTIVE' | 'INACTIVE';
    updatedAt: string;
  }>): Promise<void> {
    await this.db
      .update(schema.retailOutlets)
      .set(data)
      .where(eq(schema.retailOutlets.id, id));
  }

  async createOutletUserAssignment(data: {
    id: string;
    outletId: string;
    userId: string;
    assignmentType: 'DEALER' | 'CSP' | 'INSPECTOR';
    effectiveFrom: string;
    effectiveTo?: string | null;
    isActive: boolean;
    createdAt: string;
    createdBy: string;
  }): Promise<OutletUserAssignment> {
    await this.db.insert(schema.outletUserAssignments).values({
      id: data.id,
      outletId: data.outletId,
      userId: data.userId,
      assignmentType: data.assignmentType,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo ?? null,
      isActive: data.isActive,
      createdAt: data.createdAt,
      createdBy: data.createdBy,
    });

    return {
      id: data.id,
      outletId: data.outletId,
      userId: data.userId,
      assignmentType: data.assignmentType,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo ?? null,
      isActive: data.isActive,
      createdAt: data.createdAt,
      createdBy: data.createdBy,
    };
  }

  async listOutletAssignments(outletId: string): Promise<OutletUserAssignment[]> {
    const res = await this.db
      .select({
        assignment: schema.outletUserAssignments,
        userName: schema.users.name,
        userEmail: schema.users.email,
        userEmpCode: schema.users.empCode,
      })
      .from(schema.outletUserAssignments)
      .innerJoin(schema.users, eq(schema.outletUserAssignments.userId, schema.users.id))
      .where(eq(schema.outletUserAssignments.outletId, outletId));

    return res.map(r => ({
      ...r.assignment,
      userName: r.userName,
      userEmail: r.userEmail,
      userEmpCode: r.userEmpCode,
    }));
  }
}
