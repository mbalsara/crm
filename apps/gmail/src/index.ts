import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { logger } from './utils/logger';

// Routes
import webhooksRoutes from './routes/webhooks';
import syncRoutes from './routes/sync';
import watchRenewalRoutes from './routes/watch-renewal';

const app = new Hono();

// Middleware
app.use('*', honoLogger());
app.use('*', cors());

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'gmail-sync',
    timestamp: new Date().toISOString(),
  });
});

// API Routes (with error handling for route setup)
try {
  app.route('/webhooks', webhooksRoutes);
  app.route('/api/sync', syncRoutes);
  app.route('/api/watch', watchRenewalRoutes);
  logger.info('Routes registered successfully');
} catch (error: any) {
  logger.error({ error: error.message }, 'Failed to register routes');
}

const port = process.env.PORT ? parseInt(process.env.PORT) : 4001;

logger.info({ port, env: process.env.NODE_ENV }, 'Gmail sync service starting');

try {
  serve({
    fetch: app.fetch,
    port,
  });
  logger.info({ port }, 'Server listening successfully');
} catch (error: any) {
  logger.error({ error: error.message, stack: error.stack, port }, 'Failed to start server');
  process.exit(1);
}
