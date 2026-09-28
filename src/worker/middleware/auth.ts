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

  // Update session last seen timestamp
  c.executionCtx?.waitUntil(sessionRepo.updateLastSeen(session.id, nowIso));

  const roles = await userRepo.getUserRoles(user.id);
  const permissions = await userRepo.getUserPermissions(user.id);
  const scopes = await scopeRepo.getUserScopes(user.id);

  // Determine Primary Scope Level & Access Lists
  const isGlobalAdmin = roles.includes('ADMIN');

  let primaryScope: ScopeLevel = 'OUTLET';
  if (isGlobalAdmin || scopes.some(s => s.scopeLevel === 'GLOBAL')) {
    primaryScope = 'GLOBAL';
  } else if (scopes.some(s => s.scopeLevel === 'STATE')) {
    primaryScope = 'STATE';
  } else if (scopes.some(s => s.scopeLevel === 'DIVISION')) {
    primaryScope = 'DIVISION';
  } else if (scopes.some(s => s.scopeLevel === 'SALES_AREA')) {
    primaryScope = 'SALES_AREA';
  }

  const accessibleStateIds = scopes.map(s => s.stateId).filter((id): id is string => Boolean(id));
  const accessibleDivisionIds = scopes.map(s => s.divisionId).filter((id): id is string => Boolean(id));
  const accessibleSalesAreaIds = scopes.map(s => s.salesAreaId).filter((id): id is string => Boolean(id));
  const accessibleOutletIds = scopes.map(s => s.outletId).filter((id): id is string => Boolean(id));

  const userContext: UserContext = {
    user,
    roles,
    permissions,
    scopes,
    primaryScope,
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
