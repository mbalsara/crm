import { Context, Next } from 'hono';
import { UnauthorizedError, isAdmin } from '@crm/shared';
import type { RequestHeader } from '@crm/shared';
import { container } from 'tsyringe';
import { UserRepository } from '../users/repository';
import { logger } from '../utils/logger';

/**
 * Step 3: Load user and set RequestHeader with permissions
 * Gets user from users table with their role permissions
 */
export async function userContextMiddleware(c: Context, next: Next) {
  const tenantId = c.get('tenantId');
  const email = c.get('email');

  if (!tenantId || !email) {
    throw new UnauthorizedError('Authentication required');
  }

  // Get user from users table with role permissions
  // Uses JOIN to get role.permissions in a single query
  const userRepository = container.resolve(UserRepository);
  const result = await userRepository.findByEmailWithRole(tenantId, email);

  if (!result) {
    logger.warn(
      { email, tenantId },
      'Better-auth user not found in users table - may need manual linking'
    );
    throw new UnauthorizedError('User not found. Please contact support.');
  }

  const { user, permissions } = result;

  // Create RequestHeader with role and permissions
  const requestHeader: RequestHeader = {
    tenantId: user.tenantId,
    userId: user.id,
    roleId: user.roleId ?? undefined,
    permissions,
  };

  c.set('requestHeader', requestHeader);

  // Also set isAdmin for convenient access in routes
  c.set('isAdmin', isAdmin(permissions));

  await next();
}
