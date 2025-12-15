import { Hono } from 'hono';
import { auth } from './better-auth';

export const betterAuthRoutes = new Hono();

/**
 * Mount better-auth API handler
 * 
 * Official better-auth Hono integration:
 * https://www.better-auth.com/docs/integrations/hono
 * 
 * According to the docs, we use app.on() with the route pattern and pass c.req.raw directly
 * to auth.handler(). The c.req.raw is already a Request object in Hono.
 * 
 * Handles:
 * - GET /api/auth/sign-in/google - Initiate Google SSO
 * - GET /api/auth/callback/google - Google OAuth callback
 * - GET /api/auth/session - Get current session
 * - POST /api/auth/sign-out - Sign out
 */

// Export a simple handler function that can be used directly
// This matches the better-auth docs pattern exactly
export async function betterAuthHandler(c: { req: { raw: Request; url: string; method: string; header: (name: string) => string | undefined } }) {
  // According to better-auth docs, c.req.raw should be a Request object
  // But let's ensure it has the correct URL structure
  const originalRequest = c.req.raw;
  
  // Debug: Log what we're getting
  console.log('[Better-Auth Handler] Original request URL:', originalRequest.url);
  console.log('[Better-Auth Handler] c.req.url:', c.req.url);
  
  // Check if auth.handler exists
  if (!auth.handler) {
    console.error('[Better-Auth Handler] auth.handler is not available!');
    throw new Error('Better-auth handler not initialized');
  }
  
  // Try using original request first (as per docs)
  console.log('[Better-Auth Handler] Calling auth.handler with original request...');
  try {
    const response = await auth.handler(originalRequest);
    console.log('[Better-Auth Handler] Response status:', response.status);
    
    // If 404, try reconstructing the request with explicit URL
    if (response.status === 404) {
      console.log('[Better-Auth Handler] Got 404, trying with reconstructed Request...');
      
      // Reconstruct Request with full URL
      const protocol = c.req.header('x-forwarded-proto') || 'http';
      const host = c.req.header('host') || 'localhost:4001';
      // When mounted at /api/auth/*, c.req.url might be relative
      // Better-auth needs full path: /api/auth/session
      const path = c.req.url.startsWith('/api/auth') ? c.req.url : `/api/auth${c.req.url.startsWith('/') ? c.req.url : `/${c.req.url}`}`;
      const fullUrl = `${protocol}://${host}${path}`;
      
      console.log('[Better-Auth Handler] Reconstructed URL:', fullUrl);
      
      // Create new Request with explicit URL
      const reconstructedRequest = new Request(fullUrl, {
        method: originalRequest.method,
        headers: originalRequest.headers,
        body: originalRequest.body,
      });
      
      const retryResponse = await auth.handler(reconstructedRequest);
      console.log('[Better-Auth Handler] Retry response status:', retryResponse.status);
      
      if (retryResponse.status !== 404) {
        return retryResponse;
      }
    }
    
    return response;
  } catch (error: any) {
    console.error('[Better-Auth Handler] Error calling auth.handler:', error);
    console.error('[Better-Auth Handler] Error stack:', error.stack);
    throw error;
  }
}
