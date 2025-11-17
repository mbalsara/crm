import { Hono } from 'hono';
import { container, toStructuredError, sanitizeErrorForClient } from '@crm/shared';
import { DomainExtractionService } from '../services/domain-extraction';
import { ContactExtractionService } from '../services/contact-extraction';
import { emailSchema } from '@crm/shared';
import { logger } from '../utils/logger';
import { z } from 'zod';
import type { ApiResponse } from '@crm/shared';

const app = new Hono();

const domainExtractRequestSchema = z.object({
  tenantId: z.string().uuid(),
  email: emailSchema,
});

const contactExtractRequestSchema = z.object({
  tenantId: z.string().uuid(),
  email: emailSchema,
  companies: z.array(z.object({
    id: z.string().uuid(),
    domain: z.string(),
  })).optional(),
});

/**
 * POST /api/analysis/domain-extract
 * Extract domains from email and create/update companies
 */
app.post('/domain-extract', async (c) => {
  try {
    const body = await c.req.json();
    const validated = domainExtractRequestSchema.parse(body);

    logger.info({ tenantId: validated.tenantId, emailId: validated.email.messageId }, 'Domain extraction request received');

    const domainService = container.resolve(DomainExtractionService);
    const companies = await domainService.extractAndCreateCompanies(validated.tenantId, validated.email);

    logger.info({ tenantId: validated.tenantId, companiesCreated: companies.length }, 'Domain extraction completed');

    return c.json<ApiResponse<{ companies: typeof companies }>>({
      success: true,
      data: {
        companies,
      },
    });
  } catch (error: unknown) {
    const structuredError = toStructuredError(error);
    
    // Log full error details internally
    logger.error(
      {
        error: structuredError,
        path: c.req.path,
        method: c.req.method,
      },
      'Domain extraction failed'
    );

    // Sanitize error before sending to client
    const sanitizedError = sanitizeErrorForClient(structuredError);

    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: sanitizedError,
      },
      sanitizedError.statusCode as any
    );
  }
});

/**
 * POST /api/analysis/contact-extract
 * Extract contacts from email and create/update them, linking to companies
 */
app.post('/contact-extract', async (c) => {
  try {
    const body = await c.req.json();
    const validated = contactExtractRequestSchema.parse(body);

    logger.info({ tenantId: validated.tenantId, emailId: validated.email.messageId }, 'Contact extraction request received');

    const contactService = container.resolve(ContactExtractionService);
    
    // If companies are provided, use them; otherwise extract domains first
    let companies: Array<{ id: string; domain: string }> = validated.companies || [];
    
    if (companies.length === 0) {
      logger.info({ tenantId: validated.tenantId }, 'No companies provided, extracting domains first');
      const domainService = container.resolve(DomainExtractionService);
      companies = await domainService.extractAndCreateCompanies(validated.tenantId, validated.email);
    }

    const contacts = await contactService.extractAndCreateContacts(validated.tenantId, validated.email, companies);

    logger.info({ tenantId: validated.tenantId, contactsCreated: contacts.length }, 'Contact extraction completed');

    return c.json<ApiResponse<{ contacts: typeof contacts; companies: typeof companies }>>({
      success: true,
      data: {
        contacts,
        companies,
      },
    });
  } catch (error: unknown) {
    const structuredError = toStructuredError(error);
    
    // Log full error details internally
    logger.error(
      {
        error: structuredError,
        path: c.req.path,
        method: c.req.method,
      },
      'Contact extraction failed'
    );

    // Sanitize error before sending to client
    const sanitizedError = sanitizeErrorForClient(structuredError);

    return c.json<ApiResponse<never>>(
      {
        success: false,
        error: sanitizedError,
      },
      sanitizedError.statusCode as any
    );
  }
});

export default app;
