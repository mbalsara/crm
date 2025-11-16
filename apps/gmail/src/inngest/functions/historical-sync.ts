import { inngest } from '../client';
import { container } from '@crm/shared';
import { IntegrationClient, RunClient, EmailClient } from '@crm/clients';
import { GmailService } from '../../services/gmail';
import { EmailParserService } from '../../services/email-parser';

/**
 * Generate monthly chunks between two dates
 */
function generateMonthlyChunks(
  startDate: string,
  endDate: string
): Array<{ start: Date; end: Date }> {
  const chunks: Array<{ start: Date; end: Date }> = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);

  while (current < end) {
    const chunkStart = new Date(current);
    const chunkEnd = new Date(current);
    chunkEnd.setMonth(chunkEnd.getMonth() + 1);

    if (chunkEnd > end) {
      chunks.push({ start: chunkStart, end });
      break;
    }

    chunks.push({ start: chunkStart, end: chunkEnd });
    current = chunkEnd;
  }

  return chunks;
}

export const historicalSync = inngest.createFunction(
  {
    id: 'historical-sync',
    retries: 1,
    timeout: '30m', // Long timeout for historical sync
  },
  { event: 'gmail/sync.historical' },
  async ({ event, step, logger }) => {
    const { tenantId, startDate, endDate } = event.data;

    logger.info({ tenantId, startDate, endDate }, 'Starting historical sync');

    // Get integration and create run
    const run = await step.run('create-run', async () => {
      const integrationClient = container.resolve(IntegrationClient);
      const runClient = container.resolve(RunClient);

      // Get the Gmail integration for this tenant
      const integration = await integrationClient.getByTenantAndSource(tenantId, 'gmail');

      if (!integration) {
        throw new Error(`Gmail integration not found for tenant ${tenantId}`);
      }

      return await runClient.create({
        integrationId: integration.id,
        tenantId,
        runType: 'historical',
        status: 'running',
      });
    });

    try {
      // Process in monthly chunks to avoid timeouts
      const chunks = generateMonthlyChunks(startDate, endDate);

      logger.info({ tenantId, chunkCount: chunks.length }, 'Processing in monthly chunks');

      let totalProcessed = 0;
      let totalInserted = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        const result = await step.run(`sync-chunk-${i}`, async () => {
          const gmailService = container.resolve(GmailService);
          const emailParser = container.resolve(EmailParserService);
          const emailClient = container.resolve(EmailClient);

          const query = `after:${Math.floor(chunk.start.getTime() / 1000)} before:${Math.floor(chunk.end.getTime() / 1000)}`;

          let chunkProcessed = 0;
          let chunkInserted = 0;
          let pageToken: string | undefined;

          do {
            const { messages, nextPageToken } = await gmailService.listMessages(tenantId, {
              query,
              maxResults: 100,
              pageToken,
            });

            if (messages.length === 0) break;

            const messageIds = messages.map((m) => m.id!).filter(Boolean);
            const fullMessages = await gmailService.batchGetMessages(tenantId, messageIds);
            const emails = fullMessages.map((msg) => emailParser.parseMessage(msg, tenantId));

            const { insertedCount } = await emailClient.bulkInsert(emails);

            chunkProcessed += fullMessages.length;
            chunkInserted += insertedCount;

            pageToken = nextPageToken;
          } while (pageToken);

          return { processed: chunkProcessed, inserted: chunkInserted };
        });

        totalProcessed += result.processed;
        totalInserted += result.inserted;

        logger.info(
          { tenantId, chunk: i + 1, totalChunks: chunks.length, totalProcessed, totalInserted },
          'Chunk completed'
        );

        // Update run progress
        await step.run(`update-progress-${i}`, async () => {
          const runClient = container.resolve(RunClient);
          await runClient.update(run.id, {
            itemsProcessed: totalProcessed,
            itemsInserted: totalInserted,
          });
        });

        // Add delay between chunks to respect rate limits
        if (i < chunks.length - 1) {
          await step.sleep('rate-limit-delay', '5s');
        }
      }

      // Mark run as completed
      await step.run('complete-run', async () => {
        const runClient = container.resolve(RunClient);
        await runClient.update(run.id, {
          status: 'completed',
          completedAt: new Date(),
        });
      });

      logger.info({ tenantId, totalProcessed, totalInserted }, 'Historical sync completed');

      return { success: true, processed: totalProcessed, inserted: totalInserted };
    } catch (error: any) {
      logger.error({ tenantId, error }, 'Historical sync failed');

      await step.run('mark-run-failed', async () => {
        const runClient = container.resolve(RunClient);
        await runClient.update(run.id, {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: error.message,
          errorStack: error.stack,
        });
      });

      throw error;
    }
  }
);
