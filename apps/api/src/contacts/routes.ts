import { Hono } from 'hono';
import { container } from '@crm/shared';
import { ContactService } from './service';
import type { ApiResponse } from '@crm/shared';
import { createContactRequestSchema } from '@crm/clients';

export const contactRoutes = new Hono();

contactRoutes.post('/', async (c) => {
  try {
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

contactRoutes.get('/tenant/:tenantId', async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const contactService = container.resolve(ContactService);
    const contacts = await contactService.getContactsByTenant(tenantId);

    return c.json<ApiResponse<typeof contacts>>({
      success: true,
      data: contacts,
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

contactRoutes.get('/email/:tenantId/:email', async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const email = decodeURIComponent(c.req.param('email'));
    const contactService = container.resolve(ContactService);
    const contact = await contactService.getContactByEmail(tenantId, email);

    if (!contact) {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: 'Contact not found',
        },
        404
      );
    }

    return c.json<ApiResponse<typeof contact>>({
      success: true,
      data: contact,
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

contactRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const contactService = container.resolve(ContactService);
    const contact = await contactService.getContactById(id);

    if (!contact) {
      return c.json<ApiResponse<never>>(
        {
          success: false,
          error: 'Contact not found',
        },
        404
      );
    }

    return c.json<ApiResponse<typeof contact>>({
      success: true,
      data: contact,
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
