import { Hono } from 'hono';
import { container } from '@crm/shared';
import { EmailService } from './service';
import type { NewEmail } from './schema';
import { emailResultSchema, type EmailResult } from '@crm/shared';
import { logger } from '../utils/logger';

const app = new Hono();

/**
 * Bulk insert emails with threads (new provider-agnostic format)
 */
app.post('/bulk-with-threads', async (c) => {
  const body = await c.req.json<{
    tenantId: string;
    integrationId: string; // Required - provider derived from integration
    emailResults: EmailResult[];
  }>();

  // Validate request body structure
  if (!body.tenantId || !body.integrationId || !body.emailResults) {
    return c.json({ error: 'tenantId, integrationId, and emailResults are required' }, 400);
  }

  // Validate email results array
  const validationResult = emailResultSchema.array().safeParse(body.emailResults);
  if (!validationResult.success) {
    logger.error({ errors: validationResult.error.errors }, 'Invalid email results');
    return c.json({ error: 'Invalid email results', details: validationResult.error.errors }, 400);
  }

  const emailService = container.resolve(EmailService);

  try {
    const result = await emailService.bulkInsertWithThreads(
      body.tenantId,
      body.integrationId,
      validationResult.data
    );
    return c.json(result);
  } catch (error: any) {
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      tenantId: body.tenantId,
      emailResultsCount: body.emailResults?.length,
    }, 'Bulk insert with threads error');
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Bulk insert emails (legacy endpoint for backward compatibility)
 */
app.post('/bulk', async (c) => {
  const { emails } = await c.req.json<{ emails: NewEmail[] }>();

  const emailService = container.resolve(EmailService);

  try {
    const result = await emailService.bulkInsert(emails);
    return c.json(result);
  } catch (error: any) {
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      emailCount: emails?.length,
      sampleEmail: emails?.[0] ? {
        tenantId: emails[0].tenantId,
        messageId: emails[0].messageId,
      } : undefined,
    }, 'Bulk insert error');
    return c.json({ error: error.message }, 400);
  }
});

/**
 * List emails for tenant
 */
app.get('/', async (c) => {
  const tenantId = c.req.query('tenantId');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const emailService = container.resolve(EmailService);

  try {
    const result = await emailService.findByTenant(tenantId!, { limit, offset });
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Get emails by thread
 */
app.get('/thread/:threadId', async (c) => {
  const threadId = c.req.param('threadId');
  const tenantId = c.req.query('tenantId');

  const emailService = container.resolve(EmailService);

  try {
    const result = await emailService.findByThread(tenantId!, threadId);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Check if email exists
 */
app.get('/exists', async (c) => {
  const tenantId = c.req.query('tenantId');
  const provider = c.req.query('provider') || 'gmail';
  const messageId = c.req.query('messageId');

  const emailService = container.resolve(EmailService);

  try {
    const exists = await emailService.exists(tenantId!, provider, messageId!);
    return c.json({ exists });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

export default app;
