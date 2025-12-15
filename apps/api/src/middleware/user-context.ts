import { Context, Next } from 'hono';
import { UnauthorizedError } from '@crm/shared';
import type { RequestHeader } from '@crm/shared';
import { container } from 'tsyringe';
import { UserRepository } from '../users/repository';
import { logger } from '../utils/logger';

/**
 * Step 3: Load user and set RequestHeader
 * Gets user from users table and sets RequestHeader
 */
export async function userContextMiddleware(c: Context, next: Next) {
  const tenantId = c.get('tenantId');
  const email = c.get('email');
  
  if (!tenantId || !email) {
    throw new UnauthorizedError('Authentication required');
  }

  // Get user from users table (using tenantId from better-auth user)
  // ✅ Only one query needed - tenantId already known from session
  const userRepository = container.resolve(UserRepository);
  const user = await userRepository.findByEmail(tenantId, email);

  if (!user) {
    logger.warn(
      { email, tenantId },
      'Better-auth user not found in users table - may need manual linking'
    );
    throw new UnauthorizedError('User not found. Please contact support.');
  }

  // Create RequestHeader (same format as current system)
  const requestHeader: RequestHeader = {
    tenantId: user.tenantId,
    userId: user.id,
  };

  c.set('requestHeader', requestHeader);
  await next();
}
