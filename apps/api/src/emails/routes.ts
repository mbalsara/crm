import { Hono } from 'hono';
import { container } from '@crm/shared';
import { EmailService } from './service';
import type { NewEmail } from './schema';
import { logger } from '../utils/logger';

const app = new Hono();

/**
 * Bulk insert emails
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
        gmailMessageId: emails[0].gmailMessageId,
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
  const gmailMessageId = c.req.query('gmailMessageId');

  const emailService = container.resolve(EmailService);

  try {
    const exists = await emailService.exists(tenantId!, gmailMessageId!);
    return c.json({ exists });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

export default app;
