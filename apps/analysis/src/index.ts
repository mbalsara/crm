import 'reflect-metadata';
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { setupContainer } from './di/container';
import { logger } from './utils/logger';

// Routes
import analysisRoutes from './routes/analysis';

// Setup dependency injection (with error handling)
try {
  setupContainer();
  logger.info('Dependency injection container setup complete');
} catch (error: any) {
  logger.error({ error: error.message, stack: error.stack }, 'Failed to setup DI container');
  // Continue anyway - some routes might still work
}

const app = new Hono();

// Middleware
app.use('*', honoLogger());
app.use('*', cors());

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'analysis',
    timestamp: new Date().toISOString(),
  });
});

// API Routes (with error handling for route setup)
try {
  app.route('/api/analysis', analysisRoutes);
  logger.info('Routes registered successfully');
} catch (error: any) {
  logger.error({ error: error.message }, 'Failed to register routes');
}

const port = process.env.PORT ? parseInt(process.env.PORT) : 4002;

logger.info({ port, env: process.env.NODE_ENV }, 'Analysis service starting');

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
