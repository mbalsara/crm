import { inngest } from '../client';

export const processWebhook = inngest.createFunction(
  {
    id: 'process-gmail-webhook',
    retries: 2,
  },
  { event: 'gmail/webhook.received' },
  async ({ event, step, logger }) => {
    const { tenantId, historyId, emailAddress } = event.data;

    logger.info({ tenantId, historyId, emailAddress }, 'Processing Gmail webhook');

    // Webhook triggers incremental sync
    await step.sendEvent('trigger-incremental-sync', {
      name: 'gmail/sync.requested',
      data: {
        tenantId,
        syncType: 'webhook',
      },
    });

    logger.info({ tenantId }, 'Incremental sync triggered from webhook');

    return { success: true };
  }
);
