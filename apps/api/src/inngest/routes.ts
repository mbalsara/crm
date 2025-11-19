import { Hono } from 'hono';
import { serve } from 'inngest/hono';
import { inngest, inngestFunctions } from './client';
import { logger } from '../utils/logger';

/**
 * Inngest route handler for webhook callbacks
 * Inngest will call this endpoint to trigger functions
 */
const app = new Hono();

// Serve Inngest functions
const inngestHandler = serve({
  client: inngest,
  functions: inngestFunctions,
});

// Mount Inngest handler at /api/inngest
// Inngest will call this endpoint to trigger functions
app.all('/api/inngest/*', async (c) => {
  try {
    // Forward request to Inngest handler
    const response = await inngestHandler.fetch(c.req.raw);
    return response;
  } catch (error: any) {
    logger.error(
      {
        error: {
          message: error.message,
          stack: error.stack,
        },
        path: c.req.path,
      },
      'Inngest handler error'
    );
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
