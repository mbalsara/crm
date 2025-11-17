import { Hono } from 'hono';
import { container } from '@crm/shared';
import { CompanyService } from './service';
import type { ApiResponse } from '@crm/shared';
import { createCompanyRequestSchema } from '@crm/clients';

export const companyRoutes = new Hono();

companyRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createCompanyRequestSchema.parse(body);
    
    const companyService = container.resolve(CompanyService);
    const company = await companyService.upsertCompany(validated);

    return c.json<ApiResponse<typeof company>>(
      {
        success: true,
        data: company,
      },
      201
    );
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: `Validation error: ${error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
        },
        400
      );
    }
    
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

companyRoutes.get('/tenant/:tenantId', async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const companyService = container.resolve(CompanyService);
    const companies = await companyService.getCompaniesByTenant(tenantId);

    return c.json<ApiResponse<typeof companies>>({
      success: true,
      data: companies,
    });
  } catch (error: any) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

companyRoutes.get('/domain/:tenantId/:domain', async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const domain = decodeURIComponent(c.req.param('domain'));
    const companyService = container.resolve(CompanyService);
    const company = await companyService.getCompanyByDomain(tenantId, domain);

    if (!company) {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: 'Company not found',
        },
        404
      );
    }

    return c.json<ApiResponse<typeof company>>({
      success: true,
      data: company,
    });
  } catch (error: any) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

companyRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const companyService = container.resolve(CompanyService);
    const company = await companyService.getCompanyById(id);

    if (!company) {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: 'Company not found',
        },
        404
      );
    }

    return c.json<ApiResponse<typeof company>>({
      success: true,
      data: company,
    });
  } catch (error: any) {
    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
