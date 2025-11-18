import { Hono } from 'hono';
import { container, NotFoundError } from '@crm/shared';
import { CompanyService } from './service';
import type { ApiResponse } from '@crm/shared';
import { createCompanyRequestSchema } from '@crm/clients/company';
import { errorHandler } from '../middleware/errorHandler';

export const companyRoutes = new Hono();

// Apply error handling middleware
companyRoutes.use('*', errorHandler);

companyRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const validated = createCompanyRequestSchema.parse(body);
  
  const companyService = container.resolve(CompanyService);
  // Convert client request (with domains array) to internal format
  const company = await companyService.upsertCompany({
    tenantId: validated.tenantId,
    domains: validated.domains,
    name: validated.name,
    website: validated.website,
    industry: validated.industry,
    metadata: validated.metadata,
  });

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
