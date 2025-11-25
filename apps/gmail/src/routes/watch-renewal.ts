import { Hono } from 'hono';
import { IntegrationClient, RunClient, EmailClient } from '@crm/clients';
import { SyncService } from '../services/sync';
import { GmailClientFactory } from '../services/gmail-client-factory';
import { GmailService } from '../services/gmail';
import { EmailParserService } from '../services/email-parser';
import { logger } from '../utils/logger';

const app = new Hono();

/**
 * Route to renew Gmail watches expiring within 2 days
 * Called by cron job every 4 hours
 * 
 * GET /api/watch/renew-expiring
 * 
 * Returns summary of renewals attempted
 */
app.get('/renew-expiring', async (c) => {
  logger.info('Starting watch renewal check');

  try {
    const integrationClient = new IntegrationClient();
    const runClient = new RunClient();
    const gmailClientFactory = new GmailClientFactory(integrationClient);
    const gmailService = new GmailService(gmailClientFactory);
    const emailParser = new EmailParserService();
    const emailClient = new EmailClient();
    const syncService = new SyncService(
      integrationClient,
      runClient,
      emailClient,
      gmailService,
      emailParser
    );

    // Get all Gmail integrations that need watch renewal (expiring within 2 days)
    const response = await fetch(
      `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/integrations/watch/renewals?source=gmail&daysBeforeExpiry=2`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch integrations: ${response.statusText}`);
    }

    const data = await response.json() as { integrations: Array<{ tenantId: string; watchExpiresAt?: string | null }> };
    const integrations = data.integrations || [];

    logger.info(
      { count: integrations.length },
      `Found ${integrations.length} integrations needing watch renewal`
    );

    const results = {
      checked: integrations.length,
      renewed: 0,
      failed: 0,
      details: [] as Array<{
        tenantId: string;
        status: 'renewed' | 'failed';
        error?: string;
      }>,
    };

    // Renew watch for each integration using SyncService
    for (const integration of integrations) {
      const { tenantId } = integration;

      try {
        logger.info({ tenantId }, 'Renewing watch for integration');

        const { historyId, watchExpiresAt, watchSetAt } = await syncService.renewWatch(tenantId);

        results.renewed++;
        results.details.push({
          tenantId,
          status: 'renewed',
        });

        logger.info(
          {
            tenantId,
            historyId,
            watchSetAt,
            watchExpiresAt,
            daysUntilExpiry: Math.ceil(
              (watchExpiresAt.getTime() - watchSetAt.getTime()) / (1000 * 60 * 60 * 24)
            ),
          },
          'Watch renewed successfully'
        );
      } catch (error: any) {
        results.failed++;
        results.details.push({
          tenantId,
          status: 'failed',
          error: error.message,
        });

        logger.error(
          {
            tenantId,
            error: {
              message: error.message,
              stack: error.stack,
              name: error.name,
            },
          },
          'Failed to renew watch for integration'
        );
      }
    }

    logger.info(
      {
        checked: results.checked,
        renewed: results.renewed,
        failed: results.failed,
      },
      'Watch renewal check completed'
    );

    return c.json({
      success: true,
      summary: {
        checked: results.checked,
        renewed: results.renewed,
        failed: results.failed,
      },
      details: results.details,
    });
  } catch (error: any) {
    logger.error(
      {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      },
      'Failed to check and renew watches'
    );

    return c.json(
      {
        success: false,
        error: error.message,
      },
      500
    );
  }
});

export default app;
