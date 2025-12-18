import { Hono } from 'hono';
import { container } from 'tsyringe';
import { NotFoundError, searchRequestSchema } from '@crm/shared';
import { CustomerService } from './service';
import type { ApiResponse, RequestHeader } from '@crm/shared';
import { createCustomerRequestSchema, type CreateCustomerRequest } from '@crm/clients';
import { errorHandler } from '../middleware/errorHandler';
import { handleApiRequest } from '../utils/api-handler';

export const customerRoutes = new Hono();

// Error handling middleware (requestHeaderMiddleware is applied in index.ts)
customerRoutes.use('*', errorHandler);

/**
 * POST /api/customers/search - Search customers
 */
customerRoutes.post('/search', async (c) => {
  return handleApiRequest(
    c,
    searchRequestSchema,
    async (requestHeader: RequestHeader, searchRequest) => {
      const service = container.resolve(CustomerService);
      return await service.search(requestHeader, searchRequest);
    }
  );
});

customerRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const validated: CreateCustomerRequest = createCustomerRequestSchema.parse(body);

  const customerService = container.resolve(CustomerService);
  const customer = await customerService.upsertCustomer(validated);

  return c.json<ApiResponse<typeof customer>>(
    {
      success: true,
      data: customer,
    },
    201
  );
});

customerRoutes.get('/tenant/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const customerService = container.resolve(CustomerService);
  const customerList = await customerService.getCustomersByTenant(tenantId);

  return c.json<ApiResponse<typeof customerList>>({
    success: true,
    data: customerList,
  });
});

customerRoutes.get('/domain/:tenantId/:domain', async (c) => {
  const tenantId = c.req.param('tenantId');
  const domain = decodeURIComponent(c.req.param('domain'));
  const customerService = container.resolve(CustomerService);
  const customer = await customerService.getCustomerByDomain(tenantId, domain);

  if (!customer) {
    throw new NotFoundError('Customer', domain);
  }

  return c.json<ApiResponse<typeof customer>>({
    success: true,
    data: customer,
  });
});

customerRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const customerService = container.resolve(CustomerService);
  const customer = await customerService.getCustomerById(id);

  if (!customer) {
    throw new NotFoundError('Customer', id);
  }

  return c.json<ApiResponse<typeof customer>>({
    success: true,
    data: customer,
  });
});
