import { Next } from 'hono';
import { AppContext } from './auth';
import { PermissionCode } from '../../shared/constants';

export function requirePermission(permissionCode: PermissionCode) {
  return async (c: AppContext, next: Next) => {
    const userCtx = c.var.user;
    if (!userCtx) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      }, 401);
    }

    if (userCtx.isGlobalAdmin || userCtx.permissions.includes(permissionCode)) {
      await next();
      return;
    }

    return c.json({
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: `Access denied. Missing required permission: ${permissionCode}`
      }
    }, 403);
  };
}

export function requireRole(roleCode: string) {
  return async (c: AppContext, next: Next) => {
    const userCtx = c.var.user;
    if (!userCtx) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      }, 401);
    }

    if (userCtx.isGlobalAdmin || userCtx.roles.includes(roleCode as any)) {
      await next();
      return;
    }

    return c.json({
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: `Access denied. Requires role: ${roleCode}`
      }
    }, 403);
  };
}
