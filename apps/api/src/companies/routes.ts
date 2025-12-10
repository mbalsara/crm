import { Hono } from 'hono';
import { container } from 'tsyringe';
import { NotFoundError, searchRequestSchema } from '@crm/shared';
import { CompanyService } from './service';
import type { ApiResponse, RequestHeader } from '@crm/shared';
import { createCompanyRequestSchema, type CreateCompanyRequest } from '@crm/clients';
import { errorHandler } from '../middleware/errorHandler';
import { requestHeaderMiddleware } from '../middleware/requestHeader';
import { handleApiRequest } from '../utils/api-handler';

export const companyRoutes = new Hono();

// Error handling middleware (requestHeaderMiddleware is applied in index.ts)
companyRoutes.use('*', errorHandler);

/**
 * POST /api/companies/search - Search companies
 */
companyRoutes.post('/search', async (c) => {
  return handleApiRequest(
    c,
    searchRequestSchema,
    async (requestHeader: RequestHeader, searchRequest) => {
      const service = container.resolve(CompanyService);
      return await service.search(requestHeader, searchRequest);
    }
  );
});

companyRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const validated: CreateCompanyRequest = createCompanyRequestSchema.parse(body);
  
  const companyService = container.resolve(CompanyService);
  const company = await companyService.upsertCompany(validated);

  return c.json<ApiResponse<typeof company>>(
    {
      success: true,
      data: company,
    },
    201
  );
});

companyRoutes.get('/tenant/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const companyService = container.resolve(CompanyService);
  const companies = await companyService.getCompaniesByTenant(tenantId);

  return c.json<ApiResponse<typeof companies>>({
    success: true,
    data: companies,
  });
});

companyRoutes.get('/domain/:tenantId/:domain', async (c) => {
  const tenantId = c.req.param('tenantId');
  const domain = decodeURIComponent(c.req.param('domain'));
  const companyService = container.resolve(CompanyService);
  const company = await companyService.getCompanyByDomain(tenantId, domain);

  if (!company) {
    throw new NotFoundError('Company', domain);
  }

  return c.json<ApiResponse<typeof company>>({
    success: true,
    data: company,
  });
});

companyRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const companyService = container.resolve(CompanyService);
  const company = await companyService.getCompanyById(id);

  if (!company) {
    throw new NotFoundError('Company', id);
  }

  return c.json<ApiResponse<typeof company>>({
    success: true,
    data: company,
  });
});
