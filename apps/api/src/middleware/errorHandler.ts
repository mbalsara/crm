import { Context } from 'hono';
import { toStructuredError, sanitizeErrorForClient } from '@crm/shared';
import { logger } from '../utils/logger';
import type { ApiResponse } from '@crm/shared';

/**
 * Error handling middleware for Hono
 * Catches errors and converts them to structured error responses
 * Sanitizes internal errors before sending to client
 */
export async function errorHandler(c: Context, next: () => Promise<void>) {
  try {
    await next();
  } catch (error: unknown) {
    const structuredError = toStructuredError(error);
    
    // Log full error details internally (for debugging)
    // This includes all internal details that won't be sent to client
    if (structuredError.statusCode >= 500) {
      logger.error(
        {
          error: structuredError, // Full error details for internal logging
          path: c.req.path,
          method: c.req.method,
        },
        `Server error occurred: ${structuredError.message}`
      );
    } else {
      logger.warn(
        {
          error: structuredError,
          path: c.req.path,
          method: c.req.method,
        },
        `Client error occurred: ${structuredError.message}`
      );
    }

    // Sanitize error before sending to client (hide internal details)
    const sanitizedError = sanitizeErrorForClient(structuredError);

    // Return sanitized error response
    const response: ApiResponse<never> = {
      success: false,
      error: sanitizedError,
    };

    return c.json(response, sanitizedError.statusCode as any);
  }
}
