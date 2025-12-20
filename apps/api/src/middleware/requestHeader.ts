import { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createHash } from 'crypto';
import { container } from 'tsyringe';
import { UnauthorizedError } from '@crm/shared';
import type { RequestHeader, PermissionType } from '@crm/shared';
import {
  verifySessionToken,
  refreshSessionToken,
  shouldRefreshSession,
  getSessionDurationSeconds,
} from '../auth/session';
import { UserRepository } from '../users/repository';
import { logger } from '../utils/logger';

// Import middleware chain components
import { betterAuthSessionMiddleware } from './better-auth-session';
import { tenantResolutionMiddleware } from './tenant-resolution';
import { userContextMiddleware } from './user-context';

// Re-export middleware chain for backward compatibility
export { betterAuthSessionMiddleware } from './better-auth-session';
export { tenantResolutionMiddleware } from './tenant-resolution';
export { userContextMiddleware } from './user-context';

// Cookie name for session (legacy custom session system)
const SESSION_COOKIE = 'session';

/**
 * Legacy requestHeaderMiddleware - uses custom HMAC-signed sessions
 * ⚠️ This is kept for backward compatibility with dev/testing routes
 * 
 * For better-auth, use the middleware chain:
 * - betterAuthSessionMiddleware
 * - tenantResolutionMiddleware  
 * - userContextMiddleware
 */
export async function requestHeaderMiddleware(c: Context, next: Next) {
  // Try to get session token from cookie or Authorization header
  let token: string | undefined;

  // 1. Check Authorization header (for Postman/API clients)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. Check cookie (for browser)
  if (!token) {
    token = getCookie(c, SESSION_COOKIE);
  }

  // 3. No token found
  if (!token) {
    throw new UnauthorizedError('Authentication required');
  }

  // Verify session token
  const session = verifySessionToken(token);

  // Create RequestHeader from session
  // Note: Legacy auth doesn't have role info, so permissions is empty
  // This is for backward compatibility during migration to better-auth
  const requestHeader: RequestHeader = {
    tenantId: session.tenantId,
    userId: session.userId,
    permissions: [], // Legacy auth doesn't have role permissions
  };
  c.set('requestHeader', requestHeader);
  c.set('session', session);

  // Auto-refresh session if close to expiring (sliding window)
  if (shouldRefreshSession(session)) {
    const newToken = refreshSessionToken(session);

    // Set refreshed cookie for browser
    setCookie(c, SESSION_COOKIE, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: getSessionDurationSeconds(),
      path: '/',
    });

    // Set header for API clients to capture new token
    c.header('X-Session-Refreshed', newToken);
  }

  await next();
}

/**
 * Get API key from request header
 */
function getApiKey(c: Context): string | undefined {
  return c.req.header('X-Internal-Api-Key');
}

/**
 * Hash API key using SHA-256
 */
function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Combined middleware chain for better-auth (recommended)
 * Chains: betterAuthSessionMiddleware → tenantResolutionMiddleware → userContextMiddleware
 *
 * Also supports internal service-to-service calls via X-Internal-Api-Key header
 */
export async function betterAuthRequestHeaderMiddleware(c: Context, next: Next) {
  // Check for internal service-to-service call first
  const apiKey = getApiKey(c);
  if (apiKey) {
    // Hash the API key and look up the service user
    const apiKeyHash = hashApiKey(apiKey);
    const userRepo = container.resolve(UserRepository);
    const result = await userRepo.findByApiKeyHash(apiKeyHash);

    if (result) {
      const requestHeader: RequestHeader = {
        tenantId: result.user.tenantId,
        userId: result.user.id,
        permissions: result.permissions as PermissionType[],
      };
      c.set('requestHeader', requestHeader);
      c.set('isInternalCall', true);

      logger.debug(
        { userId: result.user.id, tenantId: result.user.tenantId },
        'Internal API call authenticated'
      );

      await next();
      return;
    } else {
      logger.warn('Invalid internal API key provided');
      throw new UnauthorizedError('Invalid API key');
    }
  }

  // Normal user authentication flow
  await betterAuthSessionMiddleware(c, async () => {
    await tenantResolutionMiddleware(c, async () => {
      await userContextMiddleware(c, next);
    });
  });
}
