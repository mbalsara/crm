import { Hono } from 'hono';
import { z } from 'zod';
import { container } from 'tsyringe';
import { NotFoundError, ValidationError } from '@crm/shared';
import { errorHandler } from '../middleware/errorHandler';
import { getRequestHeader } from '../utils/request-header';
import { handleApiRequest, handleApiRequestWithStatus, handleGetRequestWithParams, handleApiRequestWithParams } from '../utils/api-handler';
import { UserService } from './service';
import {
  createUserRequestSchema,
  updateUserRequestSchema,
  addManagerRequestSchema,
  addCustomerRequestSchema,
} from '@crm/clients';
import { searchRequestSchema } from '@crm/shared';
import type { RequestHeader, ApiResponse } from '@crm/shared';

export const userRoutes = new Hono();

// Apply middleware (auth middleware is applied in index.ts)
userRoutes.use('*', errorHandler);

/**
 * GET /api/users/:id - Get user by ID
 */
userRoutes.get('/:id', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ id: z.uuid() }),
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
 * GET /api/users/by-customer/:customerId - Get users assigned to a customer
 */
userRoutes.get('/by-customer/:customerId', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ customerId: z.uuid() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(UserService);
      return await service.getUsersByCustomer(params.customerId);
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

      // Add customer assignments if provided
      if (request.customerAssignments && request.customerAssignments.length > 0) {
        const assignments = request.customerAssignments.map(a => ({
          customerId: a.customerId,
          roleId: a.roleId,
        }));
        await service.setCustomerAssignments(
          requestHeader.tenantId,
          user.id,
          assignments
        );
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
    z.object({ id: z.uuid() }),
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
    z.object({ id: z.uuid() }),
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
    z.object({ id: z.uuid() }),
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
    z.object({ id: z.uuid() }),
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
      id: z.uuid(),
      managerId: z.uuid(),
    }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(UserService);
      await service.removeManager(requestHeader.tenantId, params.id, params.managerId);
      return { success: true };
    }
  );
});

/**
 * POST /api/users/:id/customers - Add customer to user
 */
userRoutes.post('/:id/customers', async (c) => {
  return handleApiRequestWithParams(
    c,
    z.object({ id: z.uuid() }),
    addCustomerRequestSchema,
    async (requestHeader: RequestHeader, params, request) => {
      const service = container.resolve(UserService);
      const { CustomerService } = await import('../customers/service');
      const customerService = container.resolve(CustomerService);

      // Find customer by domain
      const customer = await customerService.getCustomerByDomain(
        requestHeader.tenantId,
        request.customerDomain
      );
      if (!customer) {
        throw new NotFoundError('Customer', request.customerDomain);
      }

      await service.addCustomerAssignment(
        requestHeader.tenantId,
        params.id,
        customer.id,
        request.roleId
      );
      return { success: true };
    }
  );
});

/**
 * DELETE /api/users/:id/customers/:customerId - Remove customer from user
 */
userRoutes.delete('/:id/customers/:customerId', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({
      id: z.uuid(),
      customerId: z.uuid(),
    }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(UserService);
      await service.removeCustomerAssignment(
        requestHeader.tenantId,
        params.id,
        params.customerId
      );
      return { success: true };
    }
  );
});

/**
 * PUT /api/users/:id/customers - Set all customer assignments for a user (replaces existing)
 */
const setCustomerAssignmentsSchema = z.object({
  assignments: z.array(z.object({
    customerId: z.string().uuid(),
    roleId: z.string().uuid().optional(),
  })),
});

userRoutes.put('/:id/customers', async (c) => {
  return handleApiRequestWithParams(
    c,
    z.object({ id: z.uuid() }),
    setCustomerAssignmentsSchema,
    async (requestHeader: RequestHeader, params, request) => {
      const service = container.resolve(UserService);
      await service.setCustomerAssignments(
        requestHeader.tenantId,
        params.id,
        request.assignments
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
