import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getDb } from '../../db';
import * as schema from '../../db/schema';
import { eq } from 'drizzle-orm';
import { UserRepository } from '../repositories/userRepository';
import { ScopeRepository } from '../repositories/scopeRepository';
import { HierarchyRepository } from '../repositories/hierarchyRepository';
import { OutletRepository } from '../repositories/outletRepository';
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
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);

  // Derive users within organizational scope hierarchy (State -> Division -> Sales Area -> Outlet)
  const accessibleUsers = await ScopeService.getAccessibleUsers(c.var.user, userRepo, scopeRepo, hierarchyRepo, outletRepo);

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
        message: 'Invalid user payload: roleCodes must be a valid enum of known system roles and required fields must be present.',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const userRepo = new UserRepository(db);
  const scopeRepo = new ScopeRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  // 1. Role Ceiling Check: non-global administrators cannot grant equal or higher role, and can never grant ADMIN
  const roleCheck = ScopeService.validateRoleCeiling(c.var.user, payload.roleCodes);
  if (!roleCheck.allowed) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'ROLE_CEILING_EXCEEDED', message: roleCheck.message || 'Cannot grant roles equal to or higher than your administrative level.' },
    }, 403);
  }

  // 2. Validate Initial Scope before any database changes
  let derivedScope: {
    stateId: string | null;
    divisionId: string | null;
    salesAreaId: string | null;
    outletId: string | null;
  } | null = null;

  if (!c.var.user.isGlobalScope && !payload.initialScope) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'initialScope is required when provisioning users by non-global administrators to ensure safe organizational boundary placement.',
      },
    }, 400);
  }

  if (payload.initialScope) {
    if (payload.initialScope.scopeLevel === 'GLOBAL' && !c.var.user.isGlobalScope) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Only accounts with GLOBAL scope authority can assign GLOBAL initial scope.' },
      }, 403);
    }

    const validation = await ScopeService.validateAndDeriveScope(payload.initialScope, hierarchyRepo, outletRepo);
    if (!validation.valid) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_SCOPE_HIERARCHY',
          message: validation.message || 'Invalid organizational hierarchy relationship for requested initial scope.',
        },
      }, 400);
    }

    derivedScope = validation.derived;

    // Confirm initial scope is strictly inside actor authority
    if (payload.initialScope.scopeLevel === 'STATE' && derivedScope.stateId) {
      if (!await ScopeService.canAccessState(c.var.user, derivedScope.stateId)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot assign initial scope outside your assigned State Office.' } }, 403);
      }
    } else if (payload.initialScope.scopeLevel === 'DIVISION' && derivedScope.divisionId) {
      if (!await ScopeService.canAccessDivision(c.var.user, derivedScope.divisionId, hierarchyRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot assign initial scope outside your assigned Divisional Office.' } }, 403);
      }
    } else if (payload.initialScope.scopeLevel === 'SALES_AREA' && derivedScope.salesAreaId) {
      if (!await ScopeService.canAccessSalesArea(c.var.user, derivedScope.salesAreaId, hierarchyRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot assign initial scope outside your assigned Sales Area.' } }, 403);
      }
    } else if (payload.initialScope.scopeLevel === 'OUTLET' && derivedScope.outletId) {
      if (!await ScopeService.canAccessOutlet(c.var.user, derivedScope.outletId, outletRepo)) {
        return c.json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot assign initial scope for an outlet outside your assigned scope.' } }, 403);
      }
    }
  }

  // 3. Email duplication check
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

  // 4. Atomic Bootstrap: user + roles + initial scope (rollback on failure to prevent orphaned users)
  let createdUser;
  let createdScope = null;
  try {
    createdUser = await userRepo.createUser({
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

    if (payload.initialScope && derivedScope) {
      createdScope = await scopeRepo.createScopeAssignment({
        id: `usa-${crypto.randomUUID()}`,
        userId: createdUser.id,
        scopeLevel: payload.initialScope.scopeLevel,
        stateId: derivedScope.stateId,
        divisionId: derivedScope.divisionId,
        salesAreaId: derivedScope.salesAreaId,
        outletId: derivedScope.outletId,
        createdAt: nowIso,
        createdBy: c.var.user.user.id,
      });
    }
  } catch (err: any) {
    // Rollback to prevent orphaned user
    try {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    } catch (cleanupErr) {
      console.error('Failed to rollback user creation:', cleanupErr);
    }
    return c.json({
      success: false,
      data: null,
      error: { code: 'USER_CREATION_FAILED', message: err.message || 'Failed to complete atomic user creation.' },
    }, 400);
  }

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'USER_CREATE',
    entityType: 'USER',
    entityId: createdUser.id,
    newValue: {
      empCode: createdUser.empCode,
      name: createdUser.name,
      email: createdUser.email,
      roles: payload.roleCodes,
      initialScope: createdScope,
    },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: {
      ...createdUser,
      initialScope: createdScope,
    },
    error: null,
  }, 201);
});

users.patch('/:id/status', requirePermission(PERMISSIONS.USERS_UPDATE) as any, async (c: AppContext) => {
  const targetUserId = c.req.param('id');
  if (!targetUserId) {
    return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'User ID required' } }, 400);
  }

  // Self status update prevention
  if (targetUserId === c.var.user.user.id) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'You cannot change your own account status.' },
    }, 403);
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
  const scopeRepo = new ScopeRepository(db);
  const hierarchyRepo = new HierarchyRepository(db);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  // SAFE MULTI-SCOPE CHECK:
  // A target user can have multiple independent scopes.
  // A non-global administrator CANNOT manage/disable a target user simply because ONE scope overlaps.
  // ALL target user scopes must be within the actor's authority!
  const canModify = await ScopeService.canModifyUser(c.var.user, targetUserId, userRepo, scopeRepo, hierarchyRepo, outletRepo);
  if (!canModify) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Target user holds organizational scopes outside your administrative authority.' },
    }, 403);
  }

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
