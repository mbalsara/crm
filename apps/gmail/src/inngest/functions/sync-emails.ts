import { inngest } from '../client';
import { container } from '@crm/shared';
import { IntegrationClient, RunClient } from '@crm/clients';
import { SyncService } from '../../services/sync';

export const syncEmails = inngest.createFunction(
  {
    id: 'sync-emails',
    retries: 3,
    rateLimit: {
      limit: 10, // 10 syncs
      period: '1m', // per minute
      key: 'event.data.tenantId', // per tenant
    },
  },
  { event: 'gmail/sync.requested' },
  async ({ event, step, logger }) => {
    const { tenantId, syncType } = event.data;

    // Step 1: Get Gmail integration and create run record
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
        runType: syncType,
        status: 'running',
      });
    });

    logger.info({ tenantId, syncType, runId: run.id }, 'Starting sync run');

    try {
      // Step 2: Perform sync based on type
      await step.run('perform-sync', async () => {
        const syncService = container.resolve(SyncService);

        switch (syncType) {
          case 'initial':
            await syncService.initialSync(tenantId, run.id);
            break;
          case 'incremental':
          case 'webhook':
            await syncService.incrementalSync(tenantId, run.id);
            break;
          default:
            throw new Error(`Unknown sync type: ${syncType}`);
        }
      });

      logger.info({ tenantId, runId: run.id }, 'Sync completed successfully');

      return { success: true, runId: run.id };
    } catch (error: any) {
      logger.error({ tenantId, runId: run.id, error }, 'Sync failed');

      // Update run with error
      await step.run('mark-run-failed', async () => {
        const runClient = container.resolve(RunClient);
        await runClient.update(run.id, {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: error.message,
          errorStack: error.stack,
        });
      });

      throw error; // Re-throw for Inngest retry
    }
  }
);
