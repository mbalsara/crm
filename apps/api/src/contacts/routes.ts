import { Hono } from 'hono';
import { container, NotFoundError } from '@crm/shared';
import { ContactService } from './service';
import type { ApiResponse } from '@crm/shared';
import { createContactRequestSchema } from '@crm/clients';
import { errorHandler } from '../middleware/errorHandler';

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

contactRoutes.get('/tenant/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const contactService = container.resolve(ContactService);
  const contacts = await contactService.getContactsByTenant(tenantId);

  return c.json<ApiResponse<typeof contacts>>({
    success: true,
    data: contacts,
  });
});

contactRoutes.get('/email/:tenantId/:email', async (c) => {
  const tenantId = c.req.param('tenantId');
  const email = decodeURIComponent(c.req.param('email'));
  const contactService = container.resolve(ContactService);
  const contact = await contactService.getContactByEmail(tenantId, email);

  if (!contact) {
    throw new NotFoundError('Contact', email);
  }

  return c.json<ApiResponse<typeof contact>>({
    success: true,
    data: contact,
  });
});

contactRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const contactService = container.resolve(ContactService);
  const contact = await contactService.getContactById(id);

  if (!contact) {
    throw new NotFoundError('Contact', id);
  }

  return c.json<ApiResponse<typeof contact>>({
    success: true,
    data: contact,
  });
});
