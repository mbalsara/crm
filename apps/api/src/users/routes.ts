import { Hono } from 'hono';
import { z } from 'zod';
import { container } from 'tsyringe';
import { NotFoundError, ValidationError } from '@crm/shared';
import { errorHandler } from '../middleware/errorHandler';
import { requestHeaderMiddleware } from '../middleware/requestHeader';
import { getRequestHeader } from '../utils/request-header';
import { handleApiRequest, handleApiRequestWithStatus, handleGetRequestWithParams, handleApiRequestWithParams } from '../utils/api-handler';
import { UserService } from './service';
import {
  createUserRequestSchema,
  updateUserRequestSchema,
  addManagerRequestSchema,
  addCompanyRequestSchema,
} from '@crm/clients';
import { searchRequestSchema } from '@crm/shared';
import type { RequestHeader, ApiResponse } from '@crm/shared';

export const userRoutes = new Hono();

// Apply middleware
userRoutes.use('*', requestHeaderMiddleware);
userRoutes.use('*', errorHandler);

/**
 * GET /api/users/:id - Get user by ID
 */
userRoutes.get('/:id', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ id: z.string().uuid() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(UserService);
      const user = await service.getById(requestHeader, params.id);

      if (!user) {
        throw new NotFoundError('User', params.id);
      }

      return user;
    }
  );
});

/**
 * POST /api/users/find - Search users
 */
userRoutes.post('/find', async (c) => {
  return handleApiRequest(
    c,
    searchRequestSchema,
    async (requestHeader: RequestHeader, searchRequest) => {
      const service = container.resolve(UserService);
      return await service.search(requestHeader, searchRequest);
    }
  );
});

/**
 * POST /api/users - Create user
 */
userRoutes.post('/', async (c) => {
  return handleApiRequestWithStatus(
    c,
    createUserRequestSchema,
    201,
    async (requestHeader: RequestHeader, request) => {
      const service = container.resolve(UserService);
      const user = await service.create(requestHeader.tenantId, {
        firstName: request.firstName,
        lastName: request.lastName,
        email: request.email,
        rowStatus: 0, // Active by default
      });

      // Add managers if provided
      if (request.managerEmails && request.managerEmails.length > 0) {
        const managerIds: string[] = [];
        for (const email of request.managerEmails) {
          const manager = await service.getByEmail(requestHeader.tenantId, email);
          if (manager) {
            managerIds.push(manager.id);
          }
        }
        if (managerIds.length > 0) {
          await service.setManagers(requestHeader.tenantId, user.id, managerIds);
        }
      }

      // Add companies if provided
      if (request.companyDomains && request.companyDomains.length > 0) {
        const { CompanyService } = await import('../companies/service');
        const companyService = container.resolve(CompanyService);
        const assignments: Array<{ companyId: string }> = [];
        for (const domain of request.companyDomains) {
          const company = await companyService.getCompanyByDomain(requestHeader.tenantId, domain);
          if (company) {
            assignments.push({ companyId: company.id });
          }
        }
        if (assignments.length > 0) {
          await service.setCompanyAssignments(
            requestHeader.tenantId,
            user.id,
            assignments
          );
        }
      }

      return user;
    }
  );
});

/**
 * PATCH /api/users/:id - Update user
 */
userRoutes.patch('/:id', async (c) => {
  return handleApiRequestWithParams(
    c,
    z.object({ id: z.string().uuid() }),
    updateUserRequestSchema,
    async (requestHeader: RequestHeader, params, request) => {
      const service = container.resolve(UserService);
      const user = await service.update(params.id, request);

      if (!user) {
        throw new NotFoundError('User', params.id);
      }

      // Verify tenant isolation
      if (user.tenantId !== requestHeader.tenantId) {
        throw new NotFoundError('User', params.id);
      }

      return user;
    }
  );
});

/**
 * PATCH /api/users/:id/active - Mark user as active
 */
userRoutes.patch('/:id/active', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ id: z.string().uuid() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(UserService);
      return await service.markActive(requestHeader.tenantId, params.id);
    }
  );
});

/**
 * PATCH /api/users/:id/inactive - Mark user as inactive
 */
userRoutes.patch('/:id/inactive', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ id: z.string().uuid() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(UserService);
      return await service.markInactive(requestHeader.tenantId, params.id);
    }
  );
});

/**
 * POST /api/users/:id/managers - Add manager to user
 */
userRoutes.post('/:id/managers', async (c) => {
  return handleApiRequestWithParams(
    c,
    z.object({ id: z.string().uuid() }),
    addManagerRequestSchema,
    async (requestHeader: RequestHeader, params, request) => {
      const service = container.resolve(UserService);

      // Find manager by email
      const manager = await service.getByEmail(requestHeader.tenantId, request.managerEmail);
      if (!manager) {
        throw new NotFoundError('Manager', request.managerEmail);
      }

      await service.addManager(requestHeader.tenantId, params.id, manager.id);
      return { success: true };
    }
  );
});

/**
 * DELETE /api/users/:id/managers/:managerId - Remove manager from user
 */
userRoutes.delete('/:id/managers/:managerId', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({
      id: z.string().uuid(),
      managerId: z.string().uuid(),
    }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(UserService);
      await service.removeManager(requestHeader.tenantId, params.id, params.managerId);
      return { success: true };
    }
  );
});

/**
 * POST /api/users/:id/companies - Add company to user
 */
userRoutes.post('/:id/companies', async (c) => {
  return handleApiRequestWithParams(
    c,
    z.object({ id: z.string().uuid() }),
    addCompanyRequestSchema,
    async (requestHeader: RequestHeader, params, request) => {
      const service = container.resolve(UserService);
      const { CompanyService } = await import('../companies/service');
      const companyService = container.resolve(CompanyService);

      // Find company by domain
      const company = await companyService.getCompanyByDomain(
        requestHeader.tenantId,
        request.companyDomain
      );
      if (!company) {
        throw new NotFoundError('Company', request.companyDomain);
      }

      await service.addCompanyAssignment(
        requestHeader.tenantId,
        params.id,
        company.id,
        request.role
      );
      return { success: true };
    }
  );
});

/**
 * DELETE /api/users/:id/companies/:companyId - Remove company from user
 */
userRoutes.delete('/:id/companies/:companyId', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({
      id: z.string().uuid(),
      companyId: z.string().uuid(),
    }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(UserService);
      await service.removeCompanyAssignment(
        requestHeader.tenantId,
        params.id,
        params.companyId
      );
      return { success: true };
    }
  );
});

/**
 * POST /api/users/import - Import users from CSV
 */
userRoutes.post('/import', async (c) => {
  const requestHeader = getRequestHeader(c);

  // Get file from multipart form data
  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    throw new ValidationError('File is required');
  }

  // Read file content
  const content = await file.text();

  const service = container.resolve(UserService);
  const result = await service.importUsers(requestHeader.tenantId, content);

  return c.json<ApiResponse<typeof result>>({
    success: true,
    data: result,
  });
});

/**
 * GET /api/users/export - Export users to CSV
 */
userRoutes.get('/export', async (c) => {
  const requestHeader = getRequestHeader(c);
  const service = container.resolve(UserService);

  const csvContent = await service.exportUsers(requestHeader.tenantId);

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="users-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
});
