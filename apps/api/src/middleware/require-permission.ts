import { Context, Next } from 'hono';
import { ForbiddenError, hasPermission, type PermissionType } from '@crm/shared';
import type { RequestHeader } from '@crm/shared';

/**
 * Middleware factory to require specific permissions
 *
 * Usage:
 *   app.post('/users', requirePermission(Permission.USER_ADD), async (c) => { ... })
 *   app.delete('/users/:id', requirePermission(Permission.USER_DEL), async (c) => { ... })
 *
 * Multiple permissions (requires ALL):
 *   app.put('/admin', requirePermission(Permission.USER_ADD, Permission.CUSTOMER_ADD), ...)
 */
export function requirePermission(...requiredPermissions: PermissionType[]) {
  return async (c: Context, next: Next) => {
    const requestHeader = c.get('requestHeader') as RequestHeader | undefined;

    if (!requestHeader) {
      throw new ForbiddenError('Authentication required');
    }

    const userPermissions = requestHeader.permissions ?? [];

    // Check if user has all required permissions
    for (const permission of requiredPermissions) {
      if (!hasPermission(userPermissions, permission)) {
        throw new ForbiddenError('Insufficient permissions');
      }
    }

    await next();
  };
}

/**
 * Middleware factory to require any of the specified permissions
 *
 * Usage:
 *   app.get('/reports', requireAnyPermission(Permission.USER_EDIT, Permission.ADMIN), ...)
 */
export function requireAnyPermission(...requiredPermissions: PermissionType[]) {
  return async (c: Context, next: Next) => {
    const requestHeader = c.get('requestHeader') as RequestHeader | undefined;

    if (!requestHeader) {
      throw new ForbiddenError('Authentication required');
    }

    const userPermissions = requestHeader.permissions ?? [];

    // Check if user has at least one of the required permissions
    const hasAny = requiredPermissions.some((permission) =>
      hasPermission(userPermissions, permission)
    );

    if (!hasAny) {
      throw new ForbiddenError('Insufficient permissions');
    }

    await next();
  };
}

/**
 * Middleware to require admin permission
 *
 * Usage:
 *   app.use('/admin/*', requireAdmin())
 */
export function requireAdmin() {
  return async (c: Context, next: Next) => {
    const isAdmin = c.get('isAdmin') as boolean | undefined;

    if (!isAdmin) {
      throw new ForbiddenError('Admin access required');
    }

    await next();
  };
}

/**
 * Check if current request has a permission (for inline checks)
 *
 * Usage in route handler:
 *   if (checkPermission(c, Permission.USER_ADD)) {
 *     // can add users
 *   }
 */
export function checkPermission(c: Context, permission: PermissionType): boolean {
  const requestHeader = c.get('requestHeader') as RequestHeader | undefined;
  if (!requestHeader) {
    return false;
  }
  return hasPermission(requestHeader.permissions ?? [], permission);
}
