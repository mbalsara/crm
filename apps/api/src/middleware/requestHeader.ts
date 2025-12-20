import { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { UnauthorizedError, ALL_PERMISSIONS } from '@crm/shared';
import type { RequestHeader } from '@crm/shared';
import {
  verifySessionToken,
  refreshSessionToken,
  shouldRefreshSession,
  getSessionDurationSeconds,
} from '../auth/session';

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
 * Check for internal service-to-service API key
 * This allows services like Gmail to call API routes without user auth
 */
function isInternalServiceCall(c: Context): boolean {
  const apiKey = c.req.header('X-Internal-Api-Key');
  const expectedKey = process.env.INTERNAL_API_KEY;

  // Only allow if key is set and matches
  if (expectedKey && apiKey === expectedKey) {
    return true;
  }

  return false;
}

/**
 * Combined middleware chain for better-auth (recommended)
 * Chains: betterAuthSessionMiddleware → tenantResolutionMiddleware → userContextMiddleware
 *
 * Also supports internal service-to-service calls via X-Internal-Api-Key header
 */
export async function betterAuthRequestHeaderMiddleware(c: Context, next: Next) {
  // Check for internal service-to-service call first
  if (isInternalServiceCall(c)) {
    // For internal calls, grant all permissions
    // The API key authenticates the service, permissions control what it can do
    // TODO: Later can be refined to look up specific internal user permissions
    const requestHeader: RequestHeader = {
      tenantId: '', // Will be set by the route if needed
      userId: 'internal-service',
      permissions: ALL_PERMISSIONS, // Internal service has full access
    };
    c.set('requestHeader', requestHeader);
    c.set('isInternalCall', true);
    await next();
    return;
  }

  // Normal user authentication flow
  await betterAuthSessionMiddleware(c, async () => {
    await tenantResolutionMiddleware(c, async () => {
      await userContextMiddleware(c, next);
    });
  });
}
