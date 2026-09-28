import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getDb } from '../../db';
import { UserRepository } from '../repositories/userRepository';
import { ScopeRepository } from '../repositories/scopeRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { ScopeService } from '../services/scopeService';
import { UserCreateSchema, UserStatusSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';

const users = new Hono<{ Bindings: EnvBindings }>();

users.use('*', requireAuth as any);

users.get('/', requirePermission(PERMISSIONS.USERS_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const userRepo = new UserRepository(db);
  const scopeRepo = new ScopeRepository(db);

  const accessibleUsers = await ScopeService.getAccessibleUsers(c.var.user, userRepo, scopeRepo);

  // Attach roles & scope summarize to each user
  const userListWithRoles = await Promise.all(
    accessibleUsers.map(async (u) => {
      const roles = await userRepo.getUserRoles(u.id);
      const scopes = await scopeRepo.getUserScopes(u.id);
      return {
        ...u,
        roles,
        scopes,
      };
    })
  );

  return c.json({
    success: true,
    data: userListWithRoles,
    error: null,
  });
});

users.post('/', requirePermission(PERMISSIONS.USERS_CREATE) as any, async (c: AppContext) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = UserCreateSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid user payload',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const userRepo = new UserRepository(db);
  const auditRepo = new AuditRepository(db);

  const existingEmail = await userRepo.findByEmail(payload.email);
  if (existingEmail) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'DUPLICATE_EMAIL', message: `Email ${payload.email} is already in use` },
    }, 400);
  }

  const passwordHash = bcrypt.hashSync(payload.password, 10);
  const nowIso = new Date().toISOString();
  const userId = `usr-${crypto.randomUUID()}`;

  const newUser = await userRepo.createUser({
    id: userId,
    empCode: payload.empCode,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    passwordHash,
    status: payload.status,
    roleCodes: payload.roleCodes,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'USER_CREATE',
    entityType: 'USER',
    entityId: newUser.id,
    newValue: { empCode: newUser.empCode, name: newUser.name, email: newUser.email, roles: payload.roleCodes },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: newUser,
    error: null,
  });
});

users.patch('/:id/status', requirePermission(PERMISSIONS.USERS_UPDATE) as any, async (c: AppContext) => {
  const targetUserId = c.req.param('id');
  if (!targetUserId) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'User ID required' } }, 400);
  }
  const body = await c.req.json().catch(() => ({}));
  const parseResult = UserStatusSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid status',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const db = getDb(c.env.DB);
  const userRepo = new UserRepository(db);
  const auditRepo = new AuditRepository(db);

  const existing = await userRepo.findById(targetUserId);
  if (!existing) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'User not found' },
    }, 404);
  }

  const nowIso = new Date().toISOString();
  await userRepo.updateUser(targetUserId, {
    status: parseResult.data.status,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'USER_STATUS_CHANGE',
    entityType: 'USER',
    entityId: targetUserId,
    oldValue: { status: existing.status },
    newValue: { status: parseResult.data.status },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: { message: `User status updated to ${parseResult.data.status}` },
    error: null,
  });
});

export default users;
