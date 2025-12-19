import { Hono } from 'hono';
import { container } from 'tsyringe';
import { NotFoundError, searchRequestSchema } from '@crm/shared';
import { CustomerService } from './service';
import type { ApiResponse, RequestHeader } from '@crm/shared';
import { createCustomerRequestSchema, type CreateCustomerRequest } from '@crm/clients';
import { errorHandler } from '../middleware/errorHandler';
import { handleApiRequest, handleGetRequest, handleGetRequestWithParams } from '../utils/api-handler';
import { z } from 'zod';

export const customerRoutes = new Hono();

// Error handling middleware (requestHeaderMiddleware is applied in index.ts)
customerRoutes.use('*', errorHandler);

/**
 * POST /api/customers/search - Search customers (with access control)
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

/**
 * GET /api/customers - List all customers for tenant (with access control)
 */
customerRoutes.get('/', async (c) => {
  return handleGetRequest(c, async (requestHeader: RequestHeader) => {
    const service = container.resolve(CustomerService);
    return await service.getCustomersByTenantScoped(requestHeader);
  });
});

/**
 * GET /api/customers/domain/:domain - Get customer by domain (with access control)
 */
customerRoutes.get('/domain/:domain', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ domain: z.string() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(CustomerService);
      const domain = decodeURIComponent(params.domain);
      const customer = await service.getCustomerByDomainScoped(requestHeader, domain);
      if (!customer) {
        throw new NotFoundError('Customer', domain);
      }
      return customer;
    }
  );
});

/**
 * GET /api/customers/:id - Get customer by ID (with access control)
 */
customerRoutes.get('/:id', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ id: z.uuid() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(CustomerService);
      const customer = await service.getCustomerByIdScoped(requestHeader, params.id);
      if (!customer) {
        throw new NotFoundError('Customer', params.id);
      }
      return customer;
    }
  );
});

