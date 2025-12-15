import { Context, Next } from 'hono';
import { UnauthorizedError } from '@crm/shared';
import { container } from 'tsyringe';
import { BetterAuthUserService } from '../auth/better-auth-user-service';
import { logger } from '../utils/logger';

const DEV_TENANT_ID = process.env.DEV_TENANT_ID || '00000000-0000-0000-0000-000000000000';
const DEV_USER_ID = process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000000';

/**
 * Step 2: Resolve tenant from session
 * ALWAYS validates user's email domain against tenant domain for security.
 * This ensures users can only access tenants that match their SSO domain.
 */
export async function tenantResolutionMiddleware(c: Context, next: Next) {
  const session = c.get('betterAuthSession');

  if (!session) {
    // ⚠️ SECURITY: Explicit production check to prevent accidental dev auth in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    const allowDevAuth = process.env.ALLOW_DEV_AUTH === 'true';

    // Only allow dev auth in development AND when explicitly enabled
    if (isDevelopment && allowDevAuth) {
      c.set('tenantId', DEV_TENANT_ID);
      c.set('userId', DEV_USER_ID);
      await next();
      return;
    }

    // Production: Never allow dev auth
    throw new UnauthorizedError('Authentication required');
  }

  const email = session.user.email;
  const betterAuthUserId = session.user.id;

  if (!email) {
    throw new UnauthorizedError('Session missing email');
  }

  // ⚠️ SECURITY: Always validate domain and resolve tenant on every request
  // This prevents users from accessing tenants that don't match their email domain
  try {
    const betterAuthUserService = container.resolve(BetterAuthUserService);
    const result = await betterAuthUserService.linkBetterAuthUser(
      betterAuthUserId,
      email,
      session.user.name || null,
      ''
    );

    c.set('tenantId', result.tenantId);
    c.set('userId', result.userId);
    c.set('email', email);
    await next();
  } catch (error: any) {
    logger.error(
      { betterAuthUserId, email, error: error.message },
      'Tenant resolution failed'
    );
    throw new UnauthorizedError(error.message || 'Authentication failed. Please contact support.');
  }
}
