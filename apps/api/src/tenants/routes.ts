import { Hono } from 'hono';
import { container } from '@crm/shared';
import { TenantService } from './service';
import type { HonoEnv } from '../types/hono';
import type { ApiResponse } from '@crm/shared';

const app = new Hono<HonoEnv>();

/**
 * Create tenant
 */
app.post('/', async (c) => {
  const { name } = await c.req.json();
  const requestHeader = c.get('requestHeader');

  const tenantService = container.resolve(TenantService);

  try {
    const tenant = await tenantService.create(requestHeader, { name });
    // Return in ApiResponse format expected by TenantClient
    return c.json<ApiResponse<typeof tenant>>({ success: true, data: tenant });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Get tenant by ID
 */
app.get('/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');

  const tenantService = container.resolve(TenantService);
  const tenant = await tenantService.findById(tenantId);

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  // Return in ApiResponse format expected by TenantClient
  return c.json<ApiResponse<typeof tenant>>({ success: true, data: tenant });
});

export default app;
