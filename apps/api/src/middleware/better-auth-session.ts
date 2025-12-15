import { Context, Next } from 'hono';
import { auth } from '../auth/better-auth';
import { logger } from '../utils/logger';

/**
 * Step 1: Validate better-auth session
 * Only validates session, doesn't resolve tenant or user
 */
export async function betterAuthSessionMiddleware(c: Context, next: Next) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    
    if (session) {
      c.set('betterAuthSession', session);
    }
  } catch (error: any) {
    // ⚠️ SECURITY: Differentiate between error types for better security logging
    if (error.message?.includes('expired')) {
      logger.debug({ error: error.message }, 'Session expired');
    } else if (error.message?.includes('invalid')) {
      logger.warn({ 
        error: error.message, 
        ip: c.req.header('x-forwarded-for'),
        userAgent: c.req.header('user-agent'),
      }, 'Invalid session token - potential security issue');
    } else {
      logger.debug({ error: error.message }, 'No session found');
    }
  }
  
  await next();
}
