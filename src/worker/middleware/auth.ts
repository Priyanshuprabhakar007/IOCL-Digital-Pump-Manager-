import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { COOKIE_NAME } from '../../shared/constants';
import { getDb } from '../../db';
import { SessionRepository } from '../repositories/sessionRepository';
import { UserRepository } from '../repositories/userRepository';
import { ScopeRepository } from '../repositories/scopeRepository';
import { UserContext, ScopeLevel } from '../../shared/types';

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface EnvBindings {
  DB: D1Database;
  DOCUMENTS_BUCKET: R2Bucket;
}

export type AppContext = Context<{
  Bindings: EnvBindings;
  Variables: {
    user: UserContext;
    sessionToken: string;
  };
}>;

export async function requireAuth(c: AppContext, next: Next) {
  const sessionToken = getCookie(c, COOKIE_NAME);
  if (!sessionToken) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required. Please sign in.' }
    }, 401);
  }

  const db = getDb(c.env.DB);
  const sessionRepo = new SessionRepository(db);
  const userRepo = new UserRepository(db);
  const scopeRepo = new ScopeRepository(db);

  const tokenHash = await hashToken(sessionToken);
  const nowIso = new Date().toISOString();

  const session = await sessionRepo.findActiveSessionByTokenHash(tokenHash, nowIso);
  if (!session) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session.' }
    }, 401);
  }

  const user = await userRepo.findById(session.userId);
  if (!user || user.status !== 'ACTIVE') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'User account is inactive or disabled.' }
    }, 401);
  }

  // Session write optimization: throttle last_seen_at write to D1 (only if >15 mins old)
  const lastSeenMs = new Date(session.lastSeenAt).getTime();
  const nowMs = new Date(nowIso).getTime();
  if (nowMs - lastSeenMs > 15 * 60 * 1000) {
    c.executionCtx?.waitUntil(sessionRepo.updateLastSeen(session.id, nowIso));
  }

  const roles = await userRepo.getUserRoles(user.id);
  const permissions = await userRepo.getUserPermissions(user.id);
  const scopes = await scopeRepo.getUserScopes(user.id);

  // Global scope requires an explicit GLOBAL scope assignment record!
  const isGlobalScope = scopes.some(s => s.scopeLevel === 'GLOBAL');
  const isGlobalAdmin = roles.includes('ADMIN') && isGlobalScope;

  let primaryScope: ScopeLevel = 'OUTLET';
  if (isGlobalScope) {
    primaryScope = 'GLOBAL';
  } else if (scopes.some(s => s.scopeLevel === 'STATE')) {
    primaryScope = 'STATE';
  } else if (scopes.some(s => s.scopeLevel === 'DIVISION')) {
    primaryScope = 'DIVISION';
  } else if (scopes.some(s => s.scopeLevel === 'SALES_AREA')) {
    primaryScope = 'SALES_AREA';
  }

  // STRICT REQUIREMENT #2: Do not infer broad access from IDs stored in narrower scope records!
  // Collect target IDs ONLY from records corresponding to that specific scope level.
  const accessibleStateIds = scopes
    .filter(s => s.scopeLevel === 'STATE' && s.stateId)
    .map(s => s.stateId as string);

  const accessibleDivisionIds = scopes
    .filter(s => s.scopeLevel === 'DIVISION' && s.divisionId)
    .map(s => s.divisionId as string);

  const accessibleSalesAreaIds = scopes
    .filter(s => s.scopeLevel === 'SALES_AREA' && s.salesAreaId)
    .map(s => s.salesAreaId as string);

  const accessibleOutletIds = scopes
    .filter(s => s.scopeLevel === 'OUTLET' && s.outletId)
    .map(s => s.outletId as string);

  const userContext: UserContext = {
    user,
    roles,
    permissions,
    scopes,
    primaryScope,
    isGlobalScope,
    accessibleStateIds,
    accessibleDivisionIds,
    accessibleSalesAreaIds,
    accessibleOutletIds,
    isGlobalAdmin,
  };

  c.set('user', userContext);
  c.set('sessionToken', sessionToken);

  await next();
}
