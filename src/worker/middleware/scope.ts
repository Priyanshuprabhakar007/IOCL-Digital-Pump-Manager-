import { Next } from 'hono';
import { AppContext } from './auth';
import { getDb } from '../../db';
import { OutletRepository } from '../repositories/outletRepository';
import { ScopeService } from '../services/scopeService';

export function requireOutletAccess(paramName = 'id') {
  return async (c: AppContext, next: Next) => {
    const userCtx = c.var.user;
    if (!userCtx) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      }, 401);
    }

    const paramVal = c.req.param(paramName);
    const pathParts = c.req.path.split('/').filter(Boolean);
    const pathVal = pathParts[pathParts.length - 1];
    const outletId = paramVal || (pathVal !== 'outlets' ? pathVal : undefined);

    if (!outletId) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'BAD_REQUEST', message: 'Outlet ID parameter is required' }
      }, 400);
    }

    const db = getDb(c.env.DB);
    const outletRepo = new OutletRepository(db);

    const hasAccess = await ScopeService.canAccessOutlet(userCtx, outletId, outletRepo);
    if (!hasAccess) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. You do not have organizational scope access for this retail outlet.'
        }
      }, 403);
    }

    await next();
  };
}
