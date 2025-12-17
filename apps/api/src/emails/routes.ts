import { Hono } from 'hono';
import { container } from 'tsyringe';
import { EmailService } from './service';
import { EmailAnalysisService } from './analysis-service';
import { RunService } from '../runs/service';
import { dbEmailToEmail } from './converter';
import { buildThreadContext } from './thread-context';
import type { NewEmail } from './schema';
import { emailCollectionSchema, type EmailCollection, type AnalysisType } from '@crm/shared';
import { logger } from '../utils/logger';

const app = new Hono();

/**
 * Bulk insert emails with threads (new provider-agnostic format)
 * Stores emails synchronously and updates run status synchronously
 * If storage fails, returns 500 for Pub/Sub retry
 */
app.post('/bulk-with-threads', async (c) => {
  const body = await c.req.json<{
    tenantId: string;
    integrationId: string; // Required - provider derived from integration
    emailCollections: EmailCollection[];
    runId?: string; // Optional - for tracking run status updates
  }>();

  // Validate request body structure
  if (!body.tenantId || !body.integrationId || !body.emailCollections) {
    return c.json({ error: 'tenantId, integrationId, and emailCollections are required' }, 400);
  }

  // Validate email collections array
  const validationResult = emailCollectionSchema.array().safeParse(body.emailCollections);
  if (!validationResult.success) {
    logger.error({ errors: validationResult.error.issues }, 'Invalid email collections');
    return c.json({ error: 'Invalid email collections', details: validationResult.error.issues }, 400);
  }

  const emailService = container.resolve(EmailService);

  try {
    // Store emails synchronously
    const result = await emailService.bulkInsertWithThreads(
      body.tenantId,
      body.integrationId,
      validationResult.data
    );

    logger.info(
      {
        tenantId: body.tenantId,
        integrationId: body.integrationId,
        runId: body.runId,
        insertedCount: result.insertedCount,
        skippedCount: result.skippedCount,
        threadsCreated: result.threadsCreated,
      },
      'Bulk insert completed successfully'
    );

    // Update run status synchronously if runId provided
    if (body.runId) {
      try {
        const runService = container.resolve(RunService);
        
        await runService.update(body.runId, {
          status: 'completed',
          itemsProcessed: result.insertedCount + result.skippedCount,
          itemsInserted: result.insertedCount,
          itemsSkipped: result.skippedCount,
          completedAt: new Date(),
        });

        logger.info(
          { tenantId: body.tenantId, runId: body.runId },
          'Run status updated successfully'
        );
      } catch (runUpdateError: any) {
        // Log but don't fail - emails are already stored
        logger.error(
          {
            error: {
              message: runUpdateError.message,
              stack: runUpdateError.stack,
            },
            tenantId: body.tenantId,
            runId: body.runId,
          },
          'Failed to update run status (emails already stored)'
        );
      }
    }

    // Return success with actual counts
    return c.json(result);
  } catch (error: any) {
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      tenantId: body.tenantId,
      integrationId: body.integrationId,
      emailCollectionsCount: body.emailCollections?.length,
    }, 'Bulk insert failed - returning 500 for retry');

    // Return 500 so Gmail service can retry via Pub/Sub
    return c.json({ error: 'Failed to bulk insert emails', message: error.message }, 500);
  }
});

/**
 * Bulk insert emails (legacy endpoint for backward compatibility)
 */
app.post('/bulk', async (c) => {
  const { emails } = await c.req.json<{ emails: NewEmail[] }>();

  const emailService = container.resolve(EmailService);

  try {
    const result = await emailService.bulkInsert(emails);
    return c.json(result);
  } catch (error: any) {
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      emailCount: emails?.length,
      sampleEmail: emails?.[0] ? {
        tenantId: emails[0].tenantId,
        messageId: emails[0].messageId,
      } : undefined,
    }, 'Bulk insert error');
    return c.json({ error: error.message }, 400);
  }
});

/**
 * List emails for tenant
 */
app.get('/', async (c) => {
  const tenantId = c.req.query('tenantId');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const emailService = container.resolve(EmailService);

  try {
    const result = await emailService.findByTenant(tenantId!, { limit, offset });
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Get emails by thread
 */
app.get('/thread/:threadId', async (c) => {
  const threadId = c.req.param('threadId');
  const tenantId = c.req.query('tenantId');

  const emailService = container.resolve(EmailService);

  try {
    const result = await emailService.findByThread(tenantId!, threadId);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Check if email exists
 */
app.get('/exists', async (c) => {
  const tenantId = c.req.query('tenantId');
  const provider = c.req.query('provider') || 'gmail';
  const messageId = c.req.query('messageId');

  const emailService = container.resolve(EmailService);

  try {
    const exists = await emailService.exists(tenantId!, provider, messageId!);
    return c.json({ exists });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Get emails by customer
 * GET /api/emails/customer/:customerId?tenantId=xxx&limit=50&offset=0
 */
app.get('/customer/:customerId', async (c) => {
  const customerId = c.req.param('customerId');
  const tenantId = c.req.query('tenantId');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  if (!tenantId) {
    return c.json({ error: 'tenantId query parameter is required' }, 400);
  }

  const emailService = container.resolve(EmailService);

  try {
    const result = await emailService.findByCustomer(tenantId, customerId, { limit, offset });
    return c.json(result);
  } catch (error: any) {
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
      },
      tenantId,
      customerId,
    }, 'Failed to get emails by customer');
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Analyze an existing email on demand
 * POST /api/emails/:emailId/analyze?persist=true&analysisTypes=sentiment,escalation,churn
 * 
 * Query params:
 * - persist: boolean (default: false) - Whether to save results to database
 * - analysisTypes: comma-separated list (optional) - Which analyses to run (e.g., "sentiment,escalation,churn")
 *   If not provided, uses analysis service defaults (excludes domain-extraction and contact-extraction)
 * 
 * Note: tenantId is retrieved from the email record, no need to pass it
 */
app.post('/:emailId/analyze', async (c) => {
  const emailId = c.req.param('emailId');
  const persist = c.req.query('persist') === 'true';
  const analysisTypesParam = c.req.query('analysisTypes');
  
  // Parse analysisTypes from comma-separated string
  let analysisTypes: AnalysisType[] | undefined;
  if (analysisTypesParam) {
    const parsedTypes = analysisTypesParam.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    if (parsedTypes.length > 0) {
      analysisTypes = parsedTypes as AnalysisType[];
    }
  }

  const emailService = container.resolve(EmailService);
  const analysisService = container.resolve(EmailAnalysisService);

  try {
    // Fetch email from database (by ID only - tenantId is in the email record)
    const dbEmail = await emailService.findById(emailId);
    if (!dbEmail) {
      return c.json({ error: 'Email not found' }, 404);
    }

    // Get tenantId from the email record
    const tenantId = dbEmail.tenantId;

    // Get thread emails for context
    const threadResult = await emailService.findByThread(tenantId, dbEmail.threadId);
    
    // Build thread context (same logic as Inngest function)
    const threadContext = buildThreadContext(threadResult.emails, dbEmail.messageId);

    // Convert DB email to shared Email type
    const email = dbEmailToEmail(dbEmail);

    logger.info(
      {
        tenantId,
        emailId,
        persist,
        threadEmailsCount: threadResult.emails.length,
      },
      'Starting on-demand email analysis'
    );

    // Execute analysis using shared service
    // Note: We pass threadContext from raw emails for now, but the service will use thread summaries if available
    const result = await analysisService.executeAnalysis({
      tenantId,
      emailId,
      email,
      threadId: dbEmail.threadId,
      threadContext: threadContext.threadContext, // Fallback if no summaries exist
      persist,
      analysisTypes,
      useThreadSummaries: true, // Use thread summaries as context
    });

    return c.json({
      success: true,
      emailId,
      persist,
      result: {
        customersCreated: result.domainResult?.companies?.length || 0,
        contactsCreated: result.contactResult?.contacts?.length || 0,
        analyses: result.analysisResults || {},
        customers: result.domainResult?.companies || [],
        contacts: result.contactResult?.contacts || [],
      },
    });
  } catch (error: any) {
    logger.error(
      {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        emailId,
      },
      'Failed to analyze email'
    );
    return c.json({ error: error.message }, 500);
  }
});

export default app;
