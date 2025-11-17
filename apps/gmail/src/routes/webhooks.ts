import { Hono } from 'hono';
import { inngest } from '../inngest/client';
import { verifyPubSubToken, decodePubSubMessage } from '../utils/pubsub';
import { container } from '@crm/shared';
import { IntegrationClient } from '@crm/clients';
import { logger } from '../utils/logger';

const app = new Hono();

/**
 * Gmail Pub/Sub webhook endpoint
 */
app.post('/pubsub', async (c) => {
  // Verify Pub/Sub token
  const authHeader = c.req.header('Authorization');
  const isValid = await verifyPubSubToken(authHeader);

  if (!isValid) {
    logger.warn('Unauthorized webhook request');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const message = body.message;

  if (!message?.data) {
    logger.warn('Invalid webhook message format');
    return c.json({ error: 'Invalid message' }, 400);
  }

  try {
    // Decode base64 data
    const data = decodePubSubMessage(message.data);

    // Extract email address and historyId
    const { emailAddress, historyId } = data;

    if (!emailAddress || !historyId) {
      logger.warn({ data }, 'Missing emailAddress or historyId in webhook');
      return c.json({ error: 'Missing required fields' }, 400);
    }

    logger.info({ emailAddress, historyId }, 'Received webhook for email');

    // Find tenant by email address using API
    const integrationClient = container.resolve(IntegrationClient);
    const tenantId = await integrationClient.findTenantByEmail(emailAddress, 'gmail');

    if (!tenantId) {
      logger.warn({ emailAddress }, 'No tenant found for email address');
      return c.json({ error: 'No tenant found for email' }, 404);
    }

    logger.info({ tenantId, emailAddress }, 'Tenant identified from webhook');

    // TODO: Re-enable Inngest after configuring Event Key
    // Send event to Inngest
    // await inngest.send({
    //   name: 'gmail/webhook.received',
    //   data: {
    //     tenantId,
    //     historyId,
    //     emailAddress,
    //   },
    // });

    logger.info({ tenantId, emailAddress, historyId }, 'Webhook processed successfully (Inngest disabled)');

    return c.json({ success: true });
  } catch (error: any) {
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      emailAddress: message.data ? 'present' : 'missing',
    }, 'Failed to process webhook');
    return c.json({ error: 'Internal server error', message: error.message }, 500);
  }
});

export default app;
