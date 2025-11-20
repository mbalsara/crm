import { Inngest } from 'inngest';
import { container } from '@crm/shared';
import { EmailService } from '../emails/service';
import { AnalysisClient } from '@crm/clients';
import { logger } from '../utils/logger';
import type { Email } from '@crm/shared';
import { EmailAnalysisStatus } from '../emails/schema';

/**
 * Maximum number of emails to include in thread context
 * Limits token usage and memory for large threads
 * 
 * Phase 1: Include only recent emails (default: 5)
 * Phase 2: LLM will query for additional thread context via tools when needed
 */
const MAX_THREAD_CONTEXT_EMAILS = 5;

/**
 * Maximum body length per email in thread context
 */
const MAX_BODY_PREVIEW_LENGTH = 300;

/**
 * Inngest function to handle email analysis after insertion
 * This function is durable: it will retry on failures and survive service restarts
 * Uses idempotency key to prevent duplicate processing
 */
export const createAnalyzeEmailFunction = (inngest: Inngest) => {
  return inngest.createFunction(
    {
      id: 'analyze-email',
      name: 'Analyze Email After Insertion',
      retries: {
        // Custom retry schedule with increasing backoff
        // Retry after 1min, 3min, 5min, 10min, 30min
        attempts: 5,
        schedule: [
          { delay: '1m' },  // 1st retry: 1 minute
          { delay: '3m' },  // 2nd retry: 3 minutes
          { delay: '5m' },  // 3rd retry: 5 minutes
          { delay: '10m' }, // 4th retry: 10 minutes
          { delay: '30m' }, // 5th retry: 30 minutes
        ],
      },
      idempotency: 'event.data.emailId', // Use emailId as idempotency key - same email won't be analyzed twice
    },
    { event: 'email/inserted' },
    async ({ event, step }: { event: any; step: any }) => {
      const { tenantId, emailId, threadId } = event.data;

      logger.info(
        {
          tenantId,
          emailId,
          threadId,
          eventId: event.id,
        },
        'Inngest: Starting email analysis'
      );

      // Step 1: Fetch email and thread data in single query (optimized)
      // Avoids duplicate DB queries by fetching all needed data at once
      const { emailData, threadEmails } = await step.run('fetch-email-and-thread', async () => {
        const emailService = container.resolve(EmailService);

        // Fetch current email
        const email = await emailService.findById(tenantId, emailId);
        if (!email) {
          throw new Error(`Email ${emailId} not found`);
        }

        // Fetch thread emails for context (if needed)
        // This single query replaces 3 separate findByThread() calls in original implementation
        const threadResult = await emailService.findByThread(tenantId, threadId);

        // Convert DB email to shared Email type
        const emailData = {
          id: email.id,
          provider: email.provider,
          messageId: email.messageId,
          threadId: email.threadId,
          subject: email.subject,
          body: email.body,
          from: {
            email: email.fromEmail,
            name: email.fromName || undefined,
          },
          tos: email.tos || [],
          ccs: email.ccs,
          bccs: email.bccs,
          priority: email.priority as Email['priority'],
          labels: email.labels,
          receivedAt: email.receivedAt,
          metadata: email.metadata,
          analysisStatus: email.analysisStatus,
        };

        return {
          emailData,
          threadEmails: threadResult.emails,
        };
      });

      // Step 2: Check if already analyzed (idempotency check)
      const alreadyAnalyzed = emailData.analysisStatus === EmailAnalysisStatus.Completed;

      if (alreadyAnalyzed) {
        logger.info(
          {
            tenantId,
            emailId,
            threadId,
          },
          'Inngest: Email already analyzed, skipping'
        );
        return {
          tenantId,
          emailId,
          threadId,
          skipped: true,
        };
      }

      // Step 3: Execute analysis (durable step - will retry on failure)
      const analysisResults = await step.run('execute-analysis', async () => {
        const analysisClient = new AnalysisClient();
        const analysisServiceUrl = process.env.ANALYSIS_API_URL || process.env.ANALYSIS_BASE_URL || 'http://localhost:4002';

        logger.info(
          {
            tenantId,
            emailId,
            threadId,
            analysisServiceUrl,
          },
          'Inngest: Starting analysis execution'
        );

        // Build limited thread context (avoids memory issues with large threads)
        const threadContext = buildThreadContext(threadEmails, emailData.messageId);

        // Convert to Email type for analysis service
        const email: Email = {
          provider: emailData.provider as Email['provider'],
          messageId: emailData.messageId,
          threadId: emailData.threadId,
          subject: emailData.subject,
          body: emailData.body || undefined,
          from: emailData.from,
          tos: emailData.tos,
          ccs: emailData.ccs,
          bccs: emailData.bccs,
          priority: emailData.priority,
          labels: emailData.labels,
          receivedAt: emailData.receivedAt,
          metadata: emailData.metadata,
        };

        logger.debug(
          {
            tenantId,
            emailId,
            emailFrom: email.from.email,
            emailSubject: email.subject,
            hasBody: !!email.body,
            bodyLength: email.body?.length || 0,
            threadEmailsCount: threadEmails.length,
          },
          'Inngest: Email data prepared for analysis'
        );

        // Declare variables outside try blocks so they're accessible for summary logging
        let domainResult: { companies?: Array<{ id: string; domains: string[] }> } | undefined;
        let contactResult: { contacts?: Array<{ id: string; email: string; name?: string; companyId?: string }> } | undefined;

        // Run domain extraction (always) - CRITICAL: Creates companies
        try {
          logger.info(
            {
              tenantId,
              emailId,
              analysisServiceUrl,
              endpoint: '/api/analysis/domain-extract',
            },
            'Inngest: Calling domain extraction'
          );

          domainResult = await analysisClient.extractDomains(tenantId, email);

          logger.info(
            {
              tenantId,
              emailId,
              companiesCreated: domainResult?.companies?.length || 0,
              companies: domainResult?.companies?.map((c: any) => ({
                id: c.id,
                domains: c.domains,
              })),
            },
            'Inngest: Domain extraction completed successfully'
          );
        } catch (domainError: any) {
          logger.error(
            {
              tenantId,
              emailId,
              error: {
                message: domainError.message,
                stack: domainError.stack,
                status: domainError.status,
                responseBody: domainError.responseBody,
              },
              analysisServiceUrl,
              endpoint: '/api/analysis/domain-extract',
            },
            'Inngest: Domain extraction FAILED - companies not created'
          );
          // Re-throw to fail the Inngest function and trigger retry
          throw domainError;
        }

        // Run contact extraction (always) - CRITICAL: Creates contacts
        try {
          logger.info(
            {
              tenantId,
              emailId,
              analysisServiceUrl,
              endpoint: '/api/analysis/contact-extract',
              companiesProvided: domainResult?.companies?.length || 0,
            },
            'Inngest: Calling contact extraction'
          );

          contactResult = await analysisClient.extractContacts(
            tenantId,
            email,
            domainResult?.companies
          );

          logger.info(
            {
              tenantId,
              emailId,
              contactsCreated: contactResult?.contacts?.length || 0,
              contacts: contactResult?.contacts?.map((c: any) => ({
                id: c.id,
                email: c.email,
                name: c.name,
                companyId: c.companyId,
              })),
            },
            'Inngest: Contact extraction completed successfully'
          );
        } catch (contactError: any) {
          logger.error(
            {
              tenantId,
              emailId,
              error: {
                message: contactError.message,
                stack: contactError.stack,
                status: contactError.status,
                responseBody: contactError.responseBody,
              },
              analysisServiceUrl,
              endpoint: '/api/analysis/contact-extract',
              domainExtractionSucceeded: !!domainResult,
            },
            'Inngest: Contact extraction FAILED - contacts not created'
          );
          // Re-throw to fail the Inngest function and trigger retry
          throw contactError;
        }

        // Run other analyses (sentiment, escalation, etc.) if enabled
        try {
          await analysisClient.analyze(tenantId, email, {
            threadContext: threadContext.threadContext,
            // Don't specify analysisTypes - let the service use config defaults
          });
          logger.info(
            {
              tenantId,
              emailId,
            },
            'Email analysis completed'
          );
        } catch (analysisError: any) {
          // Log but don't fail - other analyses are optional
          logger.warn(
            {
              error: {
                message: analysisError.message,
                stack: analysisError.stack,
                status: analysisError.status,
              },
              tenantId,
              emailId,
            },
            'Inngest: Optional analyses failed (non-blocking)'
          );
        }

        // Return results for summary logging outside the step
        return {
          domainResult,
          contactResult,
        };
      });

      // Summary log with what was created
      logger.info(
        {
          tenantId,
          emailId,
          threadId,
          companiesCreated: analysisResults.domainResult?.companies?.length || 0,
          contactsCreated: analysisResults.contactResult?.contacts?.length || 0,
          summary: {
            companies: analysisResults.domainResult?.companies?.map((c: any) => ({
              id: c.id,
              domains: c.domains,
            })) || [],
            contacts: analysisResults.contactResult?.contacts?.map((c: any) => ({
              id: c.id,
              email: c.email,
              name: c.name,
              companyId: c.companyId,
            })) || [],
          },
        },
        'Inngest: Email analysis completed successfully'
      );

      return {
        tenantId,
        emailId,
        threadId,
        success: true,
        companiesCreated: analysisResults.domainResult?.companies?.length || 0,
        contactsCreated: analysisResults.contactResult?.contacts?.length || 0,
      };
    }
  );
};

/**
 * Build thread context string for analyses that require it
 * Limits context size to reduce token usage and prevent memory issues with large threads
 *
 * Phase 1: Includes limited recent emails (MAX_THREAD_CONTEXT_EMAILS)
 * Phase 2: LLM will query for additional thread context via tools when needed
 *
 * Performance optimizations:
 * 1. Limits to MAX_THREAD_CONTEXT_EMAILS most recent emails
 * 2. Truncates body previews to MAX_BODY_PREVIEW_LENGTH
 * 3. Prioritizes emails around the current email
 */
function buildThreadContext(threadEmails: any[], currentMessageId: string): { threadContext: string } {
  if (!threadEmails || threadEmails.length === 0) {
    return { threadContext: 'No thread history available' };
  }

  // Sort by received date
  const sortedEmails = [...threadEmails].sort((a, b) => {
    const dateA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
    const dateB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
    return dateA - dateB;
  });

  // Find current email index
  const currentIndex = sortedEmails.findIndex(e => e.messageId === currentMessageId);

  // Select emails to include (limit to MAX_THREAD_CONTEXT_EMAILS)
  // Strategy: Include the most recent emails (including current email)
  // This prioritizes recent context which is most relevant for analysis
  // Phase 2: LLM can query for older thread context via tools if needed
  let emailsToInclude: any[];

  if (sortedEmails.length <= MAX_THREAD_CONTEXT_EMAILS) {
    // Thread is small enough - include all emails
    emailsToInclude = sortedEmails;
  } else {
    // Thread is large - include the most recent MAX_THREAD_CONTEXT_EMAILS emails
    // This ensures we always include the current email (which is typically the most recent)
    emailsToInclude = sortedEmails.slice(-MAX_THREAD_CONTEXT_EMAILS);
  }

  const contextParts: string[] = [];
  if (sortedEmails.length > emailsToInclude.length) {
    contextParts.push(
      `Thread History (showing ${emailsToInclude.length} of ${sortedEmails.length} messages, most recent):\n`
    );
    contextParts.push(
      `Note: Additional thread context can be retrieved via tools if needed (Phase 2).\n`
    );
  } else {
    contextParts.push(`Thread History (${sortedEmails.length} messages):\n`);
  }

  for (const dbEmail of emailsToInclude) {
    const isCurrent = dbEmail.messageId === currentMessageId;
    const marker = isCurrent ? '[CURRENT]' : '';

    contextParts.push(`${marker} From: ${dbEmail.fromName || dbEmail.fromEmail} (${dbEmail.fromEmail})`);
    contextParts.push(`Subject: ${dbEmail.subject}`);
    if (dbEmail.receivedAt) {
      contextParts.push(`Date: ${new Date(dbEmail.receivedAt).toISOString()}`);
    }

    if (dbEmail.body) {
      const bodyPreview = dbEmail.body.length > MAX_BODY_PREVIEW_LENGTH
        ? dbEmail.body.substring(0, MAX_BODY_PREVIEW_LENGTH) + '...'
        : dbEmail.body;
      contextParts.push(`Body: ${bodyPreview}`);
    }

    contextParts.push('---');
  }

  return {
    threadContext: contextParts.join('\n'),
  };
}
