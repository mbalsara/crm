import { inngest } from '../client';
import { container } from '@crm/shared';
import { IntegrationClient } from '@crm/clients';
import { GmailClientFactory } from '../../services/gmail-client-factory';
import { logger } from '../../utils/logger';

/**
 * Scheduled function to renew Gmail watch subscriptions
 * Runs daily to check and renew watches that are about to expire
 */
export const renewWatch = inngest.createFunction(
  {
    id: 'renew-gmail-watch',
    retries: 3,
  },
  // Run every day at 2 AM UTC
  { cron: '0 2 * * *' },
  async ({ step }) => {
    logger.info('Starting Gmail watch renewal check');

    // Get all active Gmail integrations
    const integrations = await step.run('get-active-integrations', async () => {
      const integrationClient = container.resolve(IntegrationClient);
      return await integrationClient.getAllBySource('gmail', { isActive: true });
    });

    logger.info({ count: integrations.length }, 'Found active Gmail integrations');

    // Renew watch for each integration
    const results = await Promise.all(
      integrations.map(async (integration) => {
        return await step.run(`renew-watch-${integration.id}`, async () => {
          try {
            const gmailFactory = container.resolve(GmailClientFactory);
            const gmail = await gmailFactory.getClient(integration.tenantId);

            // Renew the watch
            const response = await gmail.users.watch({
              userId: 'me',
              requestBody: {
                topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/gmail-notifications`,
                labelIds: ['INBOX'],
              },
            });

            const historyId = response.data.historyId!;
            const expiresAt = new Date(parseInt(response.data.expiration!));

            logger.info(
              {
                integrationId: integration.id,
                tenantId: integration.tenantId,
                historyId,
                expiresAt
              },
              'Watch renewed successfully'
            );

            // Update integration with new history ID
            const integrationClient = container.resolve(IntegrationClient);
            await integrationClient.update(integration.id, {
              lastRunToken: historyId,
              tokenExpiresAt: expiresAt,
              lastUsedAt: new Date(),
            });

            return {
              integrationId: integration.id,
              success: true,
              historyId,
              expiresAt,
            };
          } catch (error: any) {
            logger.error(
              {
                integrationId: integration.id,
                tenantId: integration.tenantId,
                error: error.message
              },
              'Failed to renew watch'
            );

            return {
              integrationId: integration.id,
              success: false,
              error: error.message,
            };
          }
        });
      })
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info({ successful, failed, total: results.length }, 'Watch renewal completed');

    return { successful, failed, results };
  }
);
