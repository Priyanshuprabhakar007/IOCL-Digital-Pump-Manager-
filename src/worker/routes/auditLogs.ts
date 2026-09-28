import { Hono } from 'hono';
import { getDb } from '../../db';
import { AuditRepository } from '../repositories/auditRepository';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { PERMISSIONS } from '../../shared/constants';

const auditLogs = new Hono<{ Bindings: EnvBindings }>();

auditLogs.use('*', requireAuth as any);

auditLogs.get('/', requirePermission(PERMISSIONS.AUDIT_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const repo = new AuditRepository(db);

  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 100;

  const logs = await repo.listLogs(limit);

  return c.json({
    success: true,
    data: logs,
    error: null,
  });
});

export default auditLogs;
