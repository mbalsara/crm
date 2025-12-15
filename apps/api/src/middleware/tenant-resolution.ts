import { Context, Next } from 'hono';
import { UnauthorizedError } from '@crm/shared';
import { logger } from '../utils/logger';

const DEV_TENANT_ID = process.env.DEV_TENANT_ID || '00000000-0000-0000-0000-000000000000';
const DEV_USER_ID = process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000000';

/**
 * Step 2: Resolve tenant from session
 * Extracts tenantId from better-auth session
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

  const tenantId = (session.user as any).tenantId;
  const email = session.user.email;
  
  if (!email) {
    throw new UnauthorizedError('Session missing email');
  }

  // Require tenantId - no fallback (design decision #2)
  if (!tenantId) {
    logger.error(
      { betterAuthUserId: session.user.id, email },
      'Better-auth user missing tenantId - user must have company domain mapped'
    );
    // ⚠️ SECURITY: Use generic error message to prevent tenant enumeration
    throw new UnauthorizedError('Authentication failed. Please contact support.');
  }

  c.set('tenantId', tenantId);
  c.set('email', email);
  await next();
}
