import { Hono } from 'hono';
import { verifyPubSubToken, decodePubSubMessage } from '../utils/pubsub';
import { container } from '@crm/shared';
import { IntegrationClient, RunClient } from '@crm/clients';
import { SyncService } from '../services/sync';
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

    // Get integration and create run record
    const runClient = container.resolve(RunClient);
    const integration = await integrationClient.getByTenantAndSource(tenantId, 'gmail');

    if (!integration) {
      logger.error({ tenantId }, 'Gmail integration not found');
      return c.json({ error: 'Integration not found' }, 404);
    }

    const run = await runClient.create({
      integrationId: integration.id,
      tenantId,
      runType: 'webhook',
      status: 'running',
    });

    logger.info({ tenantId, runId: run.id }, 'Starting incremental sync from webhook');

    // Trigger sync in background (don't await to keep webhook fast)
    const syncService = container.resolve(SyncService);
    syncService.incrementalSync(tenantId, run.id).catch((error) => {
      logger.error({
        tenantId,
        runId: run.id,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          status: error.status,
          responseBody: error.responseBody,
        },
      }, 'Sync failed');

      // Also update the run status to failed
      runClient.update(run.id, {
        status: 'failed',
        errorMessage: error.message,
        errorStack: error.stack,
        completedAt: new Date(),
      }).catch((updateError) => {
        logger.error({ runId: run.id, error: updateError }, 'Failed to update run status');
      });
    });

    logger.info({ tenantId, emailAddress, historyId, runId: run.id }, 'Webhook processed, sync started');

    return c.json({ success: true, runId: run.id });
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
