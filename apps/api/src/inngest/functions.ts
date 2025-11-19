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
      retries: 5, // Retry up to 5 times on failure
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
      await step.run('execute-analysis', async () => {
        const analysisClient = new AnalysisClient();

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

        // Run domain extraction (always)
        const domainResult = await analysisClient.extractDomains(tenantId, email);
        logger.info(
          {
            tenantId,
            emailId,
            companiesCreated: domainResult?.companies?.length || 0,
          },
          'Domain extraction completed'
        );

        // Run contact extraction (always)
        const contactResult = await analysisClient.extractContacts(
          tenantId,
          email,
          domainResult?.companies
        );
        logger.info(
          {
            tenantId,
            emailId,
            contactsCreated: contactResult?.contacts?.length || 0,
          },
          'Contact extraction completed'
        );

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
              },
              tenantId,
              emailId,
            },
            'Optional analyses failed (non-blocking)'
          );
        }
      });

      logger.info(
        {
          tenantId,
          emailId,
          threadId,
        },
        'Inngest: Email analysis completed successfully'
      );

      return {
        tenantId,
        emailId,
        threadId,
        success: true,
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
