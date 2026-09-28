import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { UserScopeAssignment, ScopeLevel } from '../../shared/types';

export class ScopeRepository {
  constructor(private db: AppDatabase) {}

  async getUserScopes(userId: string): Promise<UserScopeAssignment[]> {
    const res = await this.db
      .select({
        usa: schema.userScopeAssignments,
        userName: schema.users.name,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
        outletName: schema.retailOutlets.name,
      })
      .from(schema.userScopeAssignments)
      .innerJoin(schema.users, eq(schema.userScopeAssignments.userId, schema.users.id))
      .leftJoin(schema.states, eq(schema.userScopeAssignments.stateId, schema.states.id))
      .leftJoin(schema.divisions, eq(schema.userScopeAssignments.divisionId, schema.divisions.id))
      .leftJoin(schema.salesAreas, eq(schema.userScopeAssignments.salesAreaId, schema.salesAreas.id))
      .leftJoin(schema.retailOutlets, eq(schema.userScopeAssignments.outletId, schema.retailOutlets.id))
      .where(eq(schema.userScopeAssignments.userId, userId));

    return res.map(r => ({
      id: r.usa.id,
      userId: r.usa.userId,
      scopeLevel: r.usa.scopeLevel as ScopeLevel,
      stateId: r.usa.stateId,
      divisionId: r.usa.divisionId,
      salesAreaId: r.usa.salesAreaId,
      outletId: r.usa.outletId,
      createdAt: r.usa.createdAt,
      createdBy: r.usa.createdBy,
      userName: r.userName,
      stateName: r.stateName ?? undefined,
      divisionName: r.divisionName ?? undefined,
      salesAreaName: r.salesAreaName ?? undefined,
      outletName: r.outletName ?? undefined,
    }));
  }

  async listAllScopes(): Promise<UserScopeAssignment[]> {
    const res = await this.db
      .select({
        usa: schema.userScopeAssignments,
        userName: schema.users.name,
        stateName: schema.states.name,
        divisionName: schema.divisions.name,
        salesAreaName: schema.salesAreas.name,
        outletName: schema.retailOutlets.name,
      })
      .from(schema.userScopeAssignments)
      .innerJoin(schema.users, eq(schema.userScopeAssignments.userId, schema.users.id))
      .leftJoin(schema.states, eq(schema.userScopeAssignments.stateId, schema.states.id))
      .leftJoin(schema.divisions, eq(schema.userScopeAssignments.divisionId, schema.divisions.id))
      .leftJoin(schema.salesAreas, eq(schema.userScopeAssignments.salesAreaId, schema.salesAreas.id))
      .leftJoin(schema.retailOutlets, eq(schema.userScopeAssignments.outletId, schema.retailOutlets.id));

    return res.map(r => ({
      id: r.usa.id,
      userId: r.usa.userId,
      scopeLevel: r.usa.scopeLevel as ScopeLevel,
      stateId: r.usa.stateId,
      divisionId: r.usa.divisionId,
      salesAreaId: r.usa.salesAreaId,
      outletId: r.usa.outletId,
      createdAt: r.usa.createdAt,
      createdBy: r.usa.createdBy,
      userName: r.userName,
      stateName: r.stateName ?? undefined,
      divisionName: r.divisionName ?? undefined,
      salesAreaName: r.salesAreaName ?? undefined,
      outletName: r.outletName ?? undefined,
    }));
  }

  async createScopeAssignment(data: {
    id: string;
    userId: string;
    scopeLevel: ScopeLevel;
    stateId?: string | null;
    divisionId?: string | null;
    salesAreaId?: string | null;
    outletId?: string | null;
    createdAt: string;
    createdBy: string;
  }): Promise<UserScopeAssignment> {
    await this.db.insert(schema.userScopeAssignments).values({
      id: data.id,
      userId: data.userId,
      scopeLevel: data.scopeLevel,
      stateId: data.stateId ?? null,
      divisionId: data.divisionId ?? null,
      salesAreaId: data.salesAreaId ?? null,
      outletId: data.outletId ?? null,
      createdAt: data.createdAt,
      createdBy: data.createdBy,
    });

    const userScopes = await this.getUserScopes(data.userId);
    const created = userScopes.find(s => s.id === data.id);
    if (!created) {
      return {
        id: data.id,
        userId: data.userId,
        scopeLevel: data.scopeLevel,
        stateId: data.stateId ?? null,
        divisionId: data.divisionId ?? null,
        salesAreaId: data.salesAreaId ?? null,
        outletId: data.outletId ?? null,
        createdAt: data.createdAt,
        createdBy: data.createdBy,
      };
    }
    return created;
  }

  async deleteScopeAssignment(id: string): Promise<void> {
    await this.db
      .delete(schema.userScopeAssignments)
      .where(eq(schema.userScopeAssignments.id, id));
  }
}
