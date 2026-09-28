import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { State, Division, SalesArea } from '../../shared/types';

export class HierarchyRepository {
  constructor(private db: AppDatabase) {}

  async listStates(): Promise<State[]> {
    const res = await this.db.select().from(schema.states);
    return res.map(s => ({
      id: s.id,
      code: s.code,
      name: s.name,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async findStateById(id: string): Promise<State | null> {
    const res = await this.db.select().from(schema.states).where(eq(schema.states.id, id)).limit(1);
    if (res.length === 0) return null;
    const s = res[0];
    return { id: s.id, code: s.code, name: s.name, status: s.status, createdAt: s.createdAt, updatedAt: s.updatedAt };
  }

  async createState(data: { id: string; code: string; name: string; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string }): Promise<State> {
    await this.db.insert(schema.states).values(data);
    return data;
  }

  async listDivisions(stateId?: string): Promise<Division[]> {
    let query = this.db
      .select({
        div: schema.divisions,
        stateName: schema.states.name,
      })
      .from(schema.divisions)
      .innerJoin(schema.states, eq(schema.divisions.stateId, schema.states.id));

    if (stateId) {
      const res = await query.where(eq(schema.divisions.stateId, stateId));
      return res.map(r => ({ ...r.div, stateName: r.stateName }));
    }

    const res = await query;
    return res.map(r => ({ ...r.div, stateName: r.stateName }));
  }

  async findDivisionById(id: string): Promise<Division | null> {
    const res = await this.db
      .select({ div: schema.divisions, stateName: schema.states.name })
      .from(schema.divisions)
      .innerJoin(schema.states, eq(schema.divisions.stateId, schema.states.id))
      .where(eq(schema.divisions.id, id))
      .limit(1);

    if (res.length === 0) return null;
    return { ...res[0].div, stateName: res[0].stateName };
  }

  async createDivision(data: { id: string; stateId: string; code: string; name: string; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string }): Promise<Division> {
    await this.db.insert(schema.divisions).values(data);
    return data;
  }

  async listSalesAreas(divisionId?: string): Promise<SalesArea[]> {
    let query = this.db
      .select({
        sa: schema.salesAreas,
        divisionName: schema.divisions.name,
        stateId: schema.divisions.stateId,
        stateName: schema.states.name,
      })
      .from(schema.salesAreas)
      .innerJoin(schema.divisions, eq(schema.salesAreas.divisionId, schema.divisions.id))
      .innerJoin(schema.states, eq(schema.divisions.stateId, schema.states.id));

    if (divisionId) {
      const res = await query.where(eq(schema.salesAreas.divisionId, divisionId));
      return res.map(r => ({ ...r.sa, divisionName: r.divisionName, stateId: r.stateId, stateName: r.stateName }));
    }

    const res = await query;
    return res.map(r => ({ ...r.sa, divisionName: r.divisionName, stateId: r.stateId, stateName: r.stateName }));
  }

  async findSalesAreaById(id: string): Promise<SalesArea | null> {
    const res = await this.db
      .select({
        sa: schema.salesAreas,
        divisionName: schema.divisions.name,
        stateId: schema.divisions.stateId,
        stateName: schema.states.name,
      })
      .from(schema.salesAreas)
      .innerJoin(schema.divisions, eq(schema.salesAreas.divisionId, schema.divisions.id))
      .innerJoin(schema.states, eq(schema.divisions.stateId, schema.states.id))
      .where(eq(schema.salesAreas.id, id))
      .limit(1);

    if (res.length === 0) return null;
    return { ...res[0].sa, divisionName: res[0].divisionName, stateId: res[0].stateId, stateName: res[0].stateName };
  }

  async createSalesArea(data: { id: string; divisionId: string; code: string; name: string; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string }): Promise<SalesArea> {
    await this.db.insert(schema.salesAreas).values(data);
    return data;
  }
}
