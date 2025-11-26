import 'reflect-metadata';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables with .env.local taking precedence
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SERVICE_API_URL',
  'SERVICE_GMAIL_URL',
];

const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please set them in .env.local or .env file');
  process.exit(1);
}

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { setupContainer } from './di/container';
import { logger } from './utils/logger';
import { requestHeaderMiddleware } from './middleware/requestHeader';
import type { HonoEnv } from './types/hono';

// Routes
import { healthRoutes } from './routes/health';
import { userRoutes } from './users/routes';
import integrationsRoutes from './integrations/routes';
import tenantsRoutes from './tenants/routes';
import emailsRoutes from './emails/routes';
import runsRoutes from './runs/routes';
import oauthRoutes from './oauth/routes';
import { companyRoutes } from './companies/routes';
import { contactRoutes } from './contacts/routes';
import inngestRoutes from './inngest/routes';

// Setup dependency injection
setupContainer();

const app = new Hono<HonoEnv>();

// Middleware
app.use('*', honoLogger());
app.use('*', cors());
app.use('*', requestHeaderMiddleware);
// Error handling middleware is applied per-route for better control

// Routes
app.route('/health', healthRoutes);
app.route('/api/users', userRoutes);
app.route('/api/integrations', integrationsRoutes);
app.route('/api/tenants', tenantsRoutes);
app.route('/api/emails', emailsRoutes);
app.route('/api/runs', runsRoutes);
app.route('/api/companies', companyRoutes);
app.route('/api/contacts', contactRoutes);
app.route('/oauth', oauthRoutes);
app.route('/', inngestRoutes); // Inngest webhook handler at /api/inngest/*

const port = process.env.PORT ? parseInt(process.env.PORT) : 4000;

logger.info({ port }, 'CRM API service starting');

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
