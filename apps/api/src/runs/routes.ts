import { Hono } from 'hono';
import { container } from '@crm/shared';
import { RunService } from './service';
import type { NewRun } from './schema';

const app = new Hono();

/**
 * Create a new run
 */
app.post('/', async (c) => {
  const body = await c.req.json<NewRun>();

  const runService = container.resolve(RunService);

  try {
    const run = await runService.create(body);
    return c.json({ run });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Get run by ID
 */
app.get('/:runId', async (c) => {
  const runId = c.req.param('runId');

  const runService = container.resolve(RunService);
  const run = await runService.findById(runId);

  if (!run) {
    return c.json({ error: 'Run not found' }, 404);
  }

  return c.json({ run });
});

/**
 * Update a run
 */
app.patch('/:runId', async (c) => {
  const runId = c.req.param('runId');
  const data = await c.req.json();

  const runService = container.resolve(RunService);

  try {
    const run = await runService.update(runId, data);
    return c.json({ run });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Get runs for tenant
 */
app.get('/', async (c) => {
  const tenantId = c.req.query('tenantId');
  const integrationId = c.req.query('integrationId');
  const limit = parseInt(c.req.query('limit') || '10');

  const runService = container.resolve(RunService);

  try {
    let runs;
    if (integrationId) {
      runs = await runService.findByIntegration(integrationId, { limit });
    } else if (tenantId) {
      runs = await runService.findByTenant(tenantId, { limit });
    } else {
      return c.json({ error: 'tenantId or integrationId is required' }, 400);
    }

    return c.json({ runs, count: runs.length });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

export default app;
