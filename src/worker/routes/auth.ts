import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import { getDb } from '../../db';
import { SessionRepository } from '../repositories/sessionRepository';
import { UserRepository } from '../repositories/userRepository';
import { ScopeRepository } from '../repositories/scopeRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { requireAuth, hashToken, AppContext, EnvBindings } from '../middleware/auth';
import { LoginSchema } from '../../shared/validators';
import { COOKIE_NAME, SESSION_DURATION_HOURS } from '../../shared/constants';

const auth = new Hono<{ Bindings: EnvBindings }>();

auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = LoginSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid login parameters',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const { email, password } = parseResult.data;
  const db = getDb(c.env.DB);

  const userRepo = new UserRepository(db);
  const sessionRepo = new SessionRepository(db);
  const auditRepo = new AuditRepository(db);

  const authUser = await userRepo.findPasswordHashByEmail(email);
  if (!authUser) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
    }, 401);
  }

  if (authUser.user.status !== 'ACTIVE') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'ACCOUNT_DISABLED', message: `Account is ${authUser.user.status.toLowerCase()}. Please contact administrator.` },
    }, 403);
  }

  const passwordValid = bcrypt.compareSync(password, authUser.passwordHash);
  if (!passwordValid) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
    }, 401);
  }

  // Create Session
  const rawToken = crypto.randomUUID() + '-' + crypto.randomUUID();
  const tokenHash = await hashToken(rawToken);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null;
  const userAgent = c.req.header('user-agent') || null;

  await sessionRepo.createSession({
    id: `sess-${crypto.randomUUID()}`,
    userId: authUser.user.id,
    tokenHash,
    expiresAt,
    createdAt: nowIso,
    lastSeenAt: nowIso,
    ipAddress,
    userAgent,
  });

  // Audit Log
  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: authUser.user.id,
    action: 'USER_LOGIN',
    entityType: 'USER',
    entityId: authUser.user.id,
    newValue: { email: authUser.user.email },
    ipAddress,
    userAgent,
    createdAt: nowIso,
  });

  // Set HttpOnly Cookie
  setCookie(c, COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DURATION_HOURS * 3600,
  });

  const roles = await userRepo.getUserRoles(authUser.user.id);
  const permissions = await userRepo.getUserPermissions(authUser.user.id);
  const scopeRepo = new ScopeRepository(db);
  const scopes = await scopeRepo.getUserScopes(authUser.user.id);

  return c.json({
    success: true,
    data: {
      user: authUser.user,
      roles,
      permissions,
      scopes,
    },
    error: null,
  });
});

auth.post('/logout', requireAuth as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const sessionRepo = new SessionRepository(db);
  const auditRepo = new AuditRepository(db);

  const sessionToken = c.var.sessionToken;
  const userCtx = c.var.user;

  if (sessionToken) {
    const tokenHash = await hashToken(sessionToken);
    const nowIso = new Date().toISOString();
    await sessionRepo.revokeSession(tokenHash, nowIso);

    await auditRepo.logAction({
      id: `aud-${crypto.randomUUID()}`,
      userId: userCtx.user.id,
      action: 'USER_LOGOUT',
      entityType: 'USER',
      entityId: userCtx.user.id,
      ipAddress: c.req.header('cf-connecting-ip') || null,
      userAgent: c.req.header('user-agent') || null,
      createdAt: nowIso,
    });
  }

  deleteCookie(c, COOKIE_NAME, { path: '/' });

  return c.json({
    success: true,
    data: { message: 'Signed out successfully' },
    error: null,
  });
});

auth.get('/me', requireAuth as any, async (c: AppContext) => {
  return c.json({
    success: true,
    data: c.var.user,
    error: null,
  });
});

export default auth;
