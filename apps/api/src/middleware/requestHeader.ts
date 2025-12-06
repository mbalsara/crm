import { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { UnauthorizedError } from '@crm/shared';
import type { RequestHeader } from '@crm/shared';
import {
  verifySessionToken,
  refreshSessionToken,
  shouldRefreshSession,
  getSessionDurationSeconds,
} from '../auth/session';

// Cookie name for session
const SESSION_COOKIE = 'session';

// Hardcoded values for development (when no auth provided)
const DEV_TENANT_ID = process.env.DEV_TENANT_ID || '00000000-0000-0000-0000-000000000000';
const DEV_USER_ID = process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000000';

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

  // 3. Development mode bypass
  if (!token) {
    if (process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_AUTH === 'true') {
      const requestHeader: RequestHeader = {
        tenantId: DEV_TENANT_ID,
        userId: DEV_USER_ID,
      };
      c.set('requestHeader', requestHeader);
      await next();
      return;
    }
    throw new UnauthorizedError('Authentication required');
  }

  // Verify session token
  const session = verifySessionToken(token);

  // Create RequestHeader from session
  const requestHeader: RequestHeader = {
    tenantId: session.tenantId,
    userId: session.userId,
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
