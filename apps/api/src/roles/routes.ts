import { Hono } from 'hono';
import { z } from 'zod';
import { container } from 'tsyringe';
import { NotFoundError, Permission } from '@crm/shared';
import { requirePermission } from '../middleware/require-permission';
import {
  handleApiRequest,
  handleApiRequestWithStatus,
  handleGetRequest,
  handleGetRequestWithParams,
  handleApiRequestWithParams,
} from '../utils/api-handler';
import { RoleService } from './service';
import type { RequestHeader } from '@crm/shared';

export const roleRoutes = new Hono();

// All role management requires ADMIN permission
roleRoutes.use('*', requirePermission(Permission.ADMIN));

// =============================================================================
// Request Schemas
// =============================================================================

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(z.number().int().min(1).max(100)).default([]),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  permissions: z.array(z.number().int().min(1).max(100)).optional(),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/roles - List all roles for tenant
 */
roleRoutes.get('/', async (c) => {
  return handleGetRequest(c, async (requestHeader: RequestHeader) => {
    const service = container.resolve(RoleService);
    return await service.getRolesByTenant(requestHeader.tenantId);
  });
});

/**
 * GET /api/roles/:id - Get role by ID
 */
roleRoutes.get('/:id', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ id: z.string().uuid() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(RoleService);
      const role = await service.getRoleById(params.id);

      if (!role || role.tenantId !== requestHeader.tenantId) {
        throw new NotFoundError('Role', params.id);
      }

      return role;
    }
  );
});

/**
 * POST /api/roles - Create new role
 */
roleRoutes.post('/', async (c) => {
  return handleApiRequestWithStatus(
    c,
    createRoleSchema,
    201,
    async (requestHeader: RequestHeader, request) => {
      const service = container.resolve(RoleService);
      return await service.createRole(requestHeader.tenantId, {
        name: request.name,
        description: request.description,
        permissions: request.permissions,
      });
    }
  );
});

/**
 * PATCH /api/roles/:id - Update role
 */
roleRoutes.patch('/:id', async (c) => {
  return handleApiRequestWithParams(
    c,
    z.object({ id: z.string().uuid() }),
    updateRoleSchema,
    async (requestHeader: RequestHeader, params, request) => {
      const service = container.resolve(RoleService);
      const role = await service.updateRole(requestHeader.tenantId, params.id, {
        name: request.name,
        description: request.description,
        permissions: request.permissions,
      });

      if (!role) {
        throw new NotFoundError('Role', params.id);
      }

      return role;
    }
  );
});

/**
 * DELETE /api/roles/:id - Delete role (only custom roles)
 */
roleRoutes.delete('/:id', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ id: z.string().uuid() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(RoleService);
      const deleted = await service.deleteRole(requestHeader.tenantId, params.id);

      if (!deleted) {
        throw new NotFoundError('Role', params.id);
      }

      return { success: true };
    }
  );
});
