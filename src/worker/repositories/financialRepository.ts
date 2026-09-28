import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { ProductPrice } from '../../shared/types';

export class FinancialRepository {
  constructor(private db: AppDatabase) {}

  async getOutletProductPrices(outletId: string): Promise<ProductPrice[]> {
    const list = await this.db.select().from(schema.outletProductPrices).where(eq(schema.outletProductPrices.outletId, outletId));
    return list as ProductPrice[];
  }

  async createOutletProductPrice(data: any): Promise<string> {
    const id = uuidv4();
    await this.db.insert(schema.outletProductPrices).values({ ...data, id });
    return id;
  }
}
