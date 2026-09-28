import { Hono } from 'hono';
import { getDb } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';

const roles = new Hono<{ Bindings: EnvBindings }>();

roles.use('*', requireAuth as any);

roles.get('/', async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const allRoles = await db.select().from(schema.roles);

  const rolesWithPerms = await Promise.all(
    allRoles.map(async (r) => {
      const perms = await db
        .select({
          code: schema.permissions.code,
          name: schema.permissions.name,
        })
        .from(schema.rolePermissions)
        .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
        .where(eq(schema.rolePermissions.roleId, r.id));

      return {
        ...r,
        permissions: perms,
      };
    })
  );

  return c.json({
    success: true,
    data: rolesWithPerms,
    error: null,
  });
});

roles.get('/permissions', async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const allPermissions = await db.select().from(schema.permissions);

  return c.json({
    success: true,
    data: allPermissions,
    error: null,
  });
});

export default roles;
