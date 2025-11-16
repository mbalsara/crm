import { Hono } from 'hono';
import { inngest } from '../inngest/client';
import { container } from '@crm/shared';
import { IntegrationClient, RunClient } from '@crm/clients';
import { logger } from '../utils/logger';

const app = new Hono();

/**
 * Trigger incremental sync
 */
app.post('/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');

  logger.info({ tenantId }, 'Triggering incremental sync');

  await inngest.send({
    name: 'gmail/sync.requested',
    data: { tenantId, syncType: 'incremental' },
  });

  return c.json({ message: 'Incremental sync job queued', tenantId });
});

/**
 * Trigger initial sync (last 30 days)
 */
app.post('/:tenantId/initial', async (c) => {
  const tenantId = c.req.param('tenantId');

  logger.info({ tenantId }, 'Triggering initial sync');

  await inngest.send({
    name: 'gmail/sync.requested',
    data: { tenantId, syncType: 'initial' },
  });

  return c.json({ message: 'Initial sync job queued', tenantId });
});

/**
 * Trigger historical sync
 */
app.post('/:tenantId/historical', async (c) => {
  const tenantId = c.req.param('tenantId');
  const body = await c.req.json();

  const startDate = body.startDate || getDate30DaysAgo();
  const endDate = body.endDate || new Date().toISOString();

  logger.info({ tenantId, startDate, endDate }, 'Triggering historical sync');

  await inngest.send({
    name: 'gmail/sync.historical',
    data: {
      tenantId,
      startDate,
      endDate,
    },
  });

  return c.json({ message: 'Historical sync job queued', tenantId, startDate, endDate });
});

/**
 * Get sync status/history for tenant
 */
app.get('/:tenantId/status', async (c) => {
  const tenantId = c.req.param('tenantId');

  const integrationClient = container.resolve(IntegrationClient);
  const runClient = container.resolve(RunClient);

  const [runs, integration] = await Promise.all([
    runClient.findByTenant(tenantId, 10),
    integrationClient.getByTenantAndSource(tenantId, 'gmail'),
  ]);

  return c.json({
    integration: {
      id: integration?.id,
      lastRunAt: integration?.lastRunAt,
      lastRunToken: integration?.lastRunToken,
    },
    recentRuns: runs,
  });
});

/**
 * Get specific run details
 */
app.get('/:tenantId/runs/:runId', async (c) => {
  const runId = c.req.param('runId');

  const runClient = container.resolve(RunClient);
  const run = await runClient.getById(runId);

  if (!run) {
    return c.json({ error: 'Run not found' }, 404);
  }

  return c.json({ run });
});


function getDate30DaysAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString();
}

export default app;
