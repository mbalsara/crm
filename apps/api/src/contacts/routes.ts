import { Hono } from 'hono';
import { container } from 'tsyringe';
import { NotFoundError } from '@crm/shared';
import { ContactService } from './service';
import type { ApiResponse, RequestHeader } from '@crm/shared';
import { createContactRequestSchema } from '@crm/clients';
import { errorHandler } from '../middleware/errorHandler';
import { handleGetRequest, handleGetRequestWithParams, handleApiRequestWithParams } from '../utils/api-handler';
import { z } from 'zod';

export const contactRoutes = new Hono();

// Apply error handling middleware
contactRoutes.use('*', errorHandler);

contactRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const validated = createContactRequestSchema.parse(body);

  const contactService = container.resolve(ContactService);
  const contact = await contactService.upsertContact(validated);

  return c.json<ApiResponse<typeof contact>>(
    {
      success: true,
      data: contact,
    },
    201
  );
});

/**
 * GET /api/contacts - List all contacts for tenant (with access control)
 */
contactRoutes.get('/', async (c) => {
  return handleGetRequest(c, async (requestHeader: RequestHeader) => {
    const service = container.resolve(ContactService);
    return await service.getContactsByTenantScoped(requestHeader);
  });
});

/**
 * GET /api/contacts/customer/:customerId - Get contacts by customer (with access control)
 */
contactRoutes.get('/customer/:customerId', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ customerId: z.uuid() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(ContactService);
      return await service.getContactsByCustomerScoped(requestHeader, params.customerId);
    }
  );
});

/**
 * GET /api/contacts/email/:email - Get contact by email (with access control)
 */
contactRoutes.get('/email/:email', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ email: z.string() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(ContactService);
      const email = decodeURIComponent(params.email);
      const contact = await service.getContactByEmailScoped(requestHeader, email);
      if (!contact) {
        throw new NotFoundError('Contact', email);
      }
      return contact;
    }
  );
});

/**
 * GET /api/contacts/:id - Get contact by ID (with access control)
 */
contactRoutes.get('/:id', async (c) => {
  return handleGetRequestWithParams(
    c,
    z.object({ id: z.uuid() }),
    async (requestHeader: RequestHeader, params) => {
      const service = container.resolve(ContactService);
      const contact = await service.getContactByIdScoped(requestHeader, params.id);
      if (!contact) {
        throw new NotFoundError('Contact', params.id);
      }
      return contact;
    }
  );
});

const updateContactRequestSchema = createContactRequestSchema.partial().extend({
  tenantId: z.uuid().optional(), // Optional for updates
});

/**
 * PATCH /api/contacts/:id - Update contact (with access control)
 */
contactRoutes.patch('/:id', async (c) => {
  return handleApiRequestWithParams(
    c,
    z.object({ id: z.uuid() }),
    updateContactRequestSchema,
    async (requestHeader: RequestHeader, params, data) => {
      const service = container.resolve(ContactService);
      const contact = await service.updateContactScoped(requestHeader, params.id, data);
      if (!contact) {
        throw new NotFoundError('Contact', params.id);
      }
      return contact;
    }
  );
});

