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

// ============================================================================
// RATE LIMITING STRATEGY
// ============================================================================
// PRODUCTION CLOUDFLARE ENVIRONMENT:
// In-memory JavaScript Maps are isolate-ephemeral and not shared across Cloudflare
// edge datacenters. Production distributed rate limiting MUST be configured via
// Cloudflare WAF Rate Limiting Rules in the Cloudflare Dashboard:
//
// 1. Rule Name: "Protect Login Endpoint Rate Limit"
// 2. Field Match: (http.request.uri.path eq "/api/v1/auth/login" and http.request.method eq "POST")
// 3. Counting Characteristic: IP Address
// 4. Rate Threshold: 5 requests per 1 minute (or 10 requests per 5 minutes)
// 5. Action: Block (period: 300 seconds) or Managed Challenge
//
// LOCAL DEVELOPMENT FALLBACK:
// The below Map serves purely as a local developer-environment fallback.
// It is explicitly NOT production security.
// ============================================================================
const localDevLoginLimiter = new Map<string, { count: number; resetAt: number }>();

// Pre-computed dummy bcrypt hash (cost 10) to ensure constant-time response for non-existent emails
const DUMMY_BCRYPT_HASH = '$2a$10$7EqJtq98hPqEX7fNZaFWoOhiIflV8qF3oK3d2gB0P5s8p4X8W8J3m';

auth.post('/login', async (c) => {
  const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const nowMs = Date.now();

  // Local development rate limiter check
  const rateLimitKey = `login:${ipAddress}`;
  const record = localDevLoginLimiter.get(rateLimitKey);
  if (record) {
    if (nowMs < record.resetAt) {
      if (record.count >= 5) {
        return c.json({
          success: false,
          data: null,
          error: { code: 'TOO_MANY_REQUESTS', message: 'Too many failed login attempts. Please try again in 5 minutes.' },
        }, 429);
      }
    } else {
      localDevLoginLimiter.delete(rateLimitKey);
    }
  }

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

  const trackFailedAttempt = () => {
    const cur = localDevLoginLimiter.get(rateLimitKey) || { count: 0, resetAt: nowMs + 5 * 60 * 1000 };
    cur.count += 1;
    localDevLoginLimiter.set(rateLimitKey, cur);
  };

  // Anti-Enumeration & Constant-Time Verification:
  // If the user does not exist, run bcrypt against the dummy hash to prevent timing attacks.
  // Never reveal whether the email exists before valid password verification.
  const hashToCompare = authUser ? authUser.passwordHash : DUMMY_BCRYPT_HASH;
  const passwordValid = bcrypt.compareSync(password, hashToCompare);

  if (!authUser || !passwordValid) {
    trackFailedAttempt();
    return c.json({
      success: false,
      data: null,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
    }, 401);
  }

  // Account status check is ONLY performed AFTER password verification succeeds!
  // This guarantees unknown email + wrong password and existing email + wrong password
  // produce strictly identical external behavior.
  if (authUser.user.status !== 'ACTIVE') {
    trackFailedAttempt();
    return c.json({
      success: false,
      data: null,
      error: { code: 'ACCOUNT_DISABLED', message: 'Account is inactive or disabled. Please contact administrator.' },
    }, 403);
  }

  // Successful login -> clear local rate limit record
  localDevLoginLimiter.delete(rateLimitKey);

  // Create Session
  const rawToken = crypto.randomUUID() + '-' + crypto.randomUUID();
  const tokenHash = await hashToken(rawToken);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

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
