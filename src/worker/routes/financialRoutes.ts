import { Hono } from 'hono';
import { getDb } from '../../db';
import { FinancialRepository } from '../repositories/financialRepository';
import { ProductPriceSchema } from '../validators';
import { parseMoneyToPaise } from '../../shared/financialUtils';
import { UserContext } from '../../shared/types';
import { AppContext, EnvBindings } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';

const app = new Hono<{ Bindings: EnvBindings; Variables: { user: UserContext; sessionToken: string; } }>();

app.use('*', requireAuth);

app.get('/:outletId/product-prices', async (c) => {
  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletId = c.req.param('outletId');
  const prices = await repo.getOutletProductPrices(outletId);
  return c.json({ data: prices });
});

app.post('/:outletId/product-prices', async (c) => {
  const db = getDb(c.env.DB);
  const repo = new FinancialRepository(db);
  const outletId = c.req.param('outletId');
  const body = await c.req.json();
  const validated = ProductPriceSchema.parse(body);
  const user = c.get('user');
  const id = await repo.createOutletProductPrice({
    ...validated,
    outletId,
    pricePaisePerUnit: parseMoneyToPaise(validated.pricePaisePerUnit),
    createdBy: user.user.id,
    createdAt: new Date().toISOString(),
  });
  return c.json({ data: { id } }, 201);
});

export default app;
