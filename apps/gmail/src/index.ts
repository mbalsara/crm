import 'reflect-metadata';
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { serve as inngestServe } from 'inngest/hono';
import { setupContainer } from './di/container';
import { inngest } from './inngest/client';
import { syncEmails, processWebhook, historicalSync } from './inngest/functions';
import { logger } from './utils/logger';

// Routes
import webhooksRoutes from './routes/webhooks';
import syncRoutes from './routes/sync';

// Setup dependency injection
setupContainer();

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

// API Routes
app.route('/webhooks', webhooksRoutes);
app.route('/api/sync', syncRoutes);

// Inngest endpoint (required by Inngest)
app.on(['GET', 'POST', 'PUT'], '/api/inngest', inngestServe({
  client: inngest,
  functions: [syncEmails, processWebhook, historicalSync],
}));

const port = process.env.PORT ? parseInt(process.env.PORT) : 4001;

logger.info({ port }, 'Gmail sync service starting');

serve({
  fetch: app.fetch,
  port,
});
