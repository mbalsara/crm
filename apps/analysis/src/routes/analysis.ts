import { Hono } from 'hono';
import { container, toStructuredError, sanitizeErrorForClient } from '@crm/shared';
import { DomainExtractionService } from '../services/domain-extraction';
import { ContactExtractionService } from '../services/contact-extraction';
import { SignatureExtractionService } from '../services/signature-extraction';
import { AnalysisExecutor } from '../framework/executor';
import { AnalysisConfigLoader } from '../framework/config-loader';
import { analysisRegistry } from '../framework/registry';
import { emailSchema, DEFAULT_ANALYSIS_CONFIG } from '@crm/shared';
import { logger } from '../utils/logger';
import { z } from 'zod';
import type { ApiResponse } from '@crm/shared';
import type { AnalysisType, AnalysisConfig } from '@crm/shared';

const app = new Hono();

const domainExtractRequestSchema = z.object({
  tenantId: z.uuid(),
  email: emailSchema,
});

const contactExtractRequestSchema = z.object({
  tenantId: z.uuid(),
  email: emailSchema,
  companies: z.array(z.object({
    id: z.uuid(),
    domains: z.array(z.string()), // Array of domains
  })).optional(),
});

const signatureExtractRequestSchema = z.object({
  tenantId: z.uuid(),
  email: emailSchema,
});

// Schema for model config
const modelConfigSchema = z.object({
  primary: z.string(),
  fallback: z.string().optional(),
});

// Schema for analysis config (partial - will merge with defaults)
const analysisConfigSchema = z.object({
  enabledAnalyses: z.record(z.string(), z.boolean()).optional(),
  modelConfigs: z.record(z.string(), modelConfigSchema).optional(),
  analysisSettings: z.record(z.string(), z.any()).optional(),
  promptVersions: z.record(z.string(), z.string()).optional(),
  customPrompts: z.record(z.string(), z.string()).optional(),
}).optional();

const analyzeRequestSchema = z.object({
  tenantId: z.uuid(),
  email: emailSchema,
  threadContext: z.string().optional(), // Thread context string (API service should build this)
  analysisTypes: z.array(z.string()).optional(), // Which analyses to run
  config: analysisConfigSchema, // Optional: override model configs, settings, etc.
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
    let companies: Array<{ id: string; domains: string[] }> = validated.companies || [];
    
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

/**
 * POST /api/analysis/signature-extract
 * Detect and extract signature from email, update contact if found
 */
app.post('/signature-extract', async (c) => {
  try {
    const body = await c.req.json();
    const validated = signatureExtractRequestSchema.parse(body);

    logger.info({ tenantId: validated.tenantId, emailId: validated.email.messageId }, 'Signature extraction request received');

    const signatureService = container.resolve(SignatureExtractionService);
    
    // Detect and extract signature (two-step process)
    const result = await signatureService.detectAndExtractSignature(
      validated.tenantId,
      validated.email,
      { tenantId: validated.tenantId }
    );

    if (!result) {
      logger.info({ tenantId: validated.tenantId, emailId: validated.email.messageId }, 'No signature detected');
      return c.json<ApiResponse<{ hasSignature: false }>>({
        success: true,
        data: {
          hasSignature: false,
        },
      });
    }

    logger.info(
      {
        tenantId: validated.tenantId,
        emailId: validated.email.messageId,
        contactId: result.contactId,
        signatureFields: Object.keys(result.signature).filter((k) => result.signature[k as keyof typeof result.signature]),
      },
      'Signature extraction completed'
    );

    return c.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
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
      'Signature extraction failed'
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
 * POST /api/analysis/analyze
 * Unified analysis endpoint using the new framework
 * Uses registry + executor + config loader
 */
app.post('/analyze', async (c) => {
  try {
    const body = await c.req.json();
    const validated = analyzeRequestSchema.parse(body);

    logger.info(
      { tenantId: validated.tenantId, emailId: validated.email.messageId },
      'Analysis request received'
    );

    // Merge provided config with defaults
    const configLoader = new AnalysisConfigLoader();
    const config: AnalysisConfig = configLoader.mergeWithDefaults({
      tenantId: validated.tenantId,
      ...validated.config,
    });

    // Determine which analyses to run
    let analysisTypes: AnalysisType[];
    if (validated.analysisTypes && validated.analysisTypes.length > 0) {
      // Use provided types
      analysisTypes = validated.analysisTypes as AnalysisType[];
    } else {
      // Use enabled analyses from config, but exclude domain-extraction and contact-extraction
      // These are handled separately via /domain-extract and /contact-extract endpoints
      const enabledTypes = configLoader.getEnabledAnalysisTypes(config) as AnalysisType[];
      analysisTypes = enabledTypes.filter(
        (type) => type !== 'domain-extraction' && type !== 'contact-extraction'
      );
    }

    if (analysisTypes.length === 0) {
      logger.info({ tenantId: validated.tenantId }, 'No analyses specified or enabled');
      return c.json<ApiResponse<{ results: Record<string, any> }>>({
        success: true,
        data: {
          results: {},
        },
      });
    }

    // Use thread context if provided (API service should build this)
    const threadContext = validated.threadContext
      ? { threadContext: validated.threadContext }
      : undefined;

    // Execute analyses
    const executor = container.resolve(AnalysisExecutor);
    const results = await executor.executeBatch(
      analysisTypes,
      validated.email,
      validated.tenantId,
      config,
      threadContext
    );

    // Convert Map to object for JSON response
    const resultsObject: Record<string, any> = {};
    for (const [type, result] of results.entries()) {
      resultsObject[type] = result.result;
    }

    logger.info(
      {
        tenantId: validated.tenantId,
        emailId: validated.email.messageId,
        analysisCount: results.size,
        analysisTypes: Array.from(results.keys()),
      },
      'Analysis completed successfully'
    );

    return c.json<ApiResponse<{ results: typeof resultsObject }>>({
      success: true,
      data: {
        results: resultsObject,
      },
    });
  } catch (error: unknown) {
    const structuredError = toStructuredError(error);
    
    logger.error(
      {
        error: structuredError,
        path: c.req.path,
        method: c.req.method,
      },
      'Analysis failed'
    );

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
 * POST /api/analysis/async/analyze
 * Async analysis endpoint (same logic, different route for future Inngest integration)
 */
app.post('/async/analyze', async (c) => {
  // For now, same implementation as /analyze
  // In the future, this will queue the analysis via Inngest
  return app.fetch(c.req.raw);
});

export default app;
