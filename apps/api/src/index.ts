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
  'SERVICE_GMAIL_URL',
  'SERVICE_ANALYSIS_URL',
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
import { authRoutes } from './auth/routes';
import inngestRoutes from './inngest/routes';

// Setup dependency injection
setupContainer();

const app = new Hono<HonoEnv>();

// Global middleware (no auth required)
app.use('*', honoLogger());
app.use('*', cors({
  origin: (origin) => {
    // Allow requests from web app (localhost:4000 for dev, or configured origins)
    const allowedOrigins = [
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      process.env.WEB_URL,
    ].filter(Boolean) as string[];

    // Return origin if allowed, null otherwise
    return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['X-Session-Refreshed'],
}));

// Public routes (no auth required)
app.route('/health', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/oauth', oauthRoutes);
app.route('/', inngestRoutes); // Inngest webhook handler at /api/inngest/*

// Protected routes (auth required)
app.use('/api/users/*', requestHeaderMiddleware);
app.use('/api/integrations/*', requestHeaderMiddleware);
app.use('/api/tenants/*', requestHeaderMiddleware);
app.use('/api/emails/*', requestHeaderMiddleware);
app.use('/api/runs/*', requestHeaderMiddleware);
app.use('/api/companies/*', requestHeaderMiddleware);
app.use('/api/contacts/*', requestHeaderMiddleware);

app.route('/api/users', userRoutes);
app.route('/api/integrations', integrationsRoutes);
app.route('/api/tenants', tenantsRoutes);
app.route('/api/emails', emailsRoutes);
app.route('/api/runs', runsRoutes);
app.route('/api/companies', companyRoutes);
app.route('/api/contacts', contactRoutes);

const port = process.env.PORT ? parseInt(process.env.PORT) : 4001;

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
