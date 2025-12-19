import { Inngest } from 'inngest';
import { container } from 'tsyringe';
import { EmailService } from '../service';
import { EmailAnalysisService } from '../analysis-service';
import { EmailRepository } from '../repository';
import { dbEmailToEmail } from '../converter';
import { logger } from '../../utils/logger';
import { EmailAnalysisStatus } from '../schema';
import type { Database } from '@crm/database';
import { emails, emailParticipants } from '../schema';
import { eq, sql, and, notInArray } from 'drizzle-orm';

/**
 * Maximum number of emails to include in thread context
 * Limits token usage and memory for large threads
 * 
 * Phase 1: Includes limited recent emails (MAX_THREAD_CONTEXT_EMAILS)
 * Phase 2: LLM will query for additional thread context via tools when needed
 */
const MAX_THREAD_CONTEXT_EMAILS = 5;
const MAX_BODY_PREVIEW_LENGTH = 300;

/**
 * Inngest function to analyze emails after insertion
 * Triggered by 'email/inserted' event from EmailService
 * 
 * Uses idempotency key to prevent duplicate processing
 */
export const createAnalyzeEmailFunction = (inngest: Inngest) => {
  return inngest.createFunction(
    {
      id: 'analyze-email',
      name: 'Analyze Email After Insertion',
      retries: 9, // Retry up to 9 times with exponential backoff
      idempotency: 'event.data.emailId', // Use emailId as idempotency key - same email won't be analyzed twice
    },
    { event: 'email/inserted' },
    async ({ event, step }: { event: any; step: any }) => {
      const { tenantId, emailId, threadId } = event.data;
      const attemptTimestamp = new Date().toISOString();

      // IDEMPOTENCY LOG: Track every analysis attempt
      logger.info(
        {
          tenantId,
          emailId,
          threadId,
          eventId: event.id,
          attemptTimestamp,
          idempotencyKey: emailId,
          logType: 'ANALYSIS_ATTEMPT_START',
        },
        'Inngest: Analysis attempt started - checking idempotency'
      );

      // Step 1: Fetch email and thread data in single query (optimized)
      // Avoids duplicate DB queries by fetching all needed data at once
      const { dbEmail, threadEmails } = await step.run('fetch-email-and-thread', async () => {
        const emailService = container.resolve(EmailService);

        // Fetch current email (tenantId will be extracted from email record)
        const email = await emailService.findById(emailId);
        if (!email) {
          throw new Error(`Email ${emailId} not found`);
        }

        // Fetch thread emails for context (if needed)
        const threadResult = await emailService.findByThread(tenantId, threadId);

        return {
          dbEmail: email,
          threadEmails: threadResult.emails,
        };
      });

      // Step 2: Check if already analyzed (DB-level idempotency check)
      const alreadyAnalyzed = dbEmail.analysisStatus === EmailAnalysisStatus.Completed;

      // IDEMPOTENCY LOG: Track DB-level check result
      logger.info(
        {
          tenantId,
          emailId,
          threadId,
          eventId: event.id,
          attemptTimestamp,
          analysisStatus: dbEmail.analysisStatus,
          alreadyAnalyzed,
          logType: 'ANALYSIS_DB_CHECK',
        },
        `Inngest: DB idempotency check - analysisStatus=${dbEmail.analysisStatus}, alreadyAnalyzed=${alreadyAnalyzed}`
      );

      if (alreadyAnalyzed) {
        // IDEMPOTENCY LOG: Skipping due to already analyzed
        logger.warn(
          {
            tenantId,
            emailId,
            threadId,
            eventId: event.id,
            attemptTimestamp,
            logType: 'ANALYSIS_SKIPPED_ALREADY_DONE',
          },
          'Inngest: SKIPPING - Email already analyzed (analysisStatus=Completed)'
        );
        return {
          tenantId,
          emailId,
          threadId,
          skipped: true,
          reason: 'already_analyzed',
        };
      }

      // Step 3: Execute analysis (durable step - will retry on failure)
      // Uses shared EmailAnalysisService for both batch and interactive operations
      const analysisResults = await step.run('execute-analysis', async () => {
        const analysisService = container.resolve(EmailAnalysisService);
        const executionStartTime = Date.now();

        // IDEMPOTENCY LOG: About to execute analysis (this is the costly part)
        logger.warn(
          {
            tenantId,
            emailId,
            threadId,
            eventId: event.id,
            attemptTimestamp,
            executionStartTime,
            logType: 'ANALYSIS_EXECUTION_START',
          },
          'Inngest: EXECUTING ANALYSIS - LLM calls will be made (cost incurred)'
        );

        // Build limited thread context (avoids memory issues with large threads)
        const threadContext = buildThreadContext(threadEmails, dbEmail.messageId);

        // Convert DB email to shared Email type for analysis service
        const email = dbEmailToEmail(dbEmail);

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

        // Execute analysis using shared service (persist=true for Inngest)
        // Uses thread summaries as context (if available), falls back to raw thread context
        const result = await analysisService.executeAnalysis({
          tenantId,
          emailId,
          email,
          threadId,
          threadContext: threadContext.threadContext, // Fallback if no summaries exist
          persist: true, // Always persist in Inngest
          useThreadSummaries: true, // Use thread summaries as context
        });

        const executionEndTime = Date.now();
        const executionDurationMs = executionEndTime - executionStartTime;

        // IDEMPOTENCY LOG: Analysis execution completed
        logger.warn(
          {
            tenantId,
            emailId,
            threadId,
            eventId: event.id,
            attemptTimestamp,
            executionStartTime,
            executionEndTime,
            executionDurationMs,
            analysisTypesExecuted: result.analysisResults ? Object.keys(result.analysisResults) : [],
            customersCreated: result.domainResult?.customers?.length || 0,
            contactsCreated: result.contactResult?.contacts?.length || 0,
            logType: 'ANALYSIS_EXECUTION_COMPLETE',
          },
          `Inngest: Analysis execution completed in ${executionDurationMs}ms`
        );

        return result;
      });

      // Analysis results are already persisted by EmailAnalysisService when persist=true
      // No need for separate persistence step

      // Summary log with what was created
      logger.info(
        {
          tenantId,
          emailId,
          threadId,
          customersCreated: analysisResults.domainResult?.customers?.length || 0,
          contactsCreated: analysisResults.contactResult?.contacts?.length || 0,
          analysesSaved: analysisResults.analysisResults ? Object.keys(analysisResults.analysisResults).length : 0,
          summary: {
            customers: analysisResults.domainResult?.customers?.map((c: any) => ({
              id: c.id,
              domains: c.domains,
            })) || [],
            contacts: analysisResults.contactResult?.contacts?.map((c: any) => ({
              id: c.id,
              email: c.email,
              name: c.name,
              customerId: c.customerId,
            })) || [],
            analyses: analysisResults.analysisResults ? Object.keys(analysisResults.analysisResults) : [],
          },
        },
        'Inngest: Email analysis completed successfully'
      );

      return {
        tenantId,
        emailId,
        threadId,
        success: true,
        customersCreated: analysisResults.domainResult?.customers?.length || 0,
        contactsCreated: analysisResults.contactResult?.contacts?.length || 0,
        analysesSaved: analysisResults.analysisResults ? Object.keys(analysisResults.analysisResults).length : 0,
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

  // Select emails to include (limit to MAX_THREAD_CONTEXT_EMAILS)
  let emailsToInclude: any[];
  if (sortedEmails.length <= MAX_THREAD_CONTEXT_EMAILS) {
    emailsToInclude = sortedEmails;
  } else {
    // Take the most recent MAX_THREAD_CONTEXT_EMAILS emails
    emailsToInclude = sortedEmails.slice(-MAX_THREAD_CONTEXT_EMAILS);
  }

  const contextParts: string[] = [];
  if (sortedEmails.length > emailsToInclude.length) {
    contextParts.push(
      `Thread History (showing ${emailsToInclude.length} of ${sortedEmails.length} messages, most recent):\n`
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

/**
 * Backfill email participants for existing emails
 * Creates participant records for emails that don't have them yet
 *
 * Triggered by 'email/backfill-participants' event
 * Can be run per-tenant or for specific email IDs
 */
export const createBackfillParticipantsFunction = (inngest: Inngest) => {
  return inngest.createFunction(
    {
      id: 'backfill-email-participants',
      name: 'Backfill Email Participants',
      retries: 3,
      concurrency: {
        limit: 1, // Only one backfill per tenant at a time
        key: 'event.data.tenantId',
      },
    },
    { event: 'email/backfill-participants' },
    async ({ event, step }: { event: any; step: any }) => {
      const { tenantId, batchSize = 100, dryRun = false } = event.data;

      logger.info(
        { tenantId, batchSize, dryRun },
        'Starting email participants backfill'
      );

      // Step 1: Find emails without participants
      const emailsToProcess = await step.run('find-emails-without-participants', async () => {
        const db = container.resolve<Database>('Database');

        // Get emails that don't have any participants yet
        const result = await db
          .select({
            id: emails.id,
            tenantId: emails.tenantId,
            threadId: emails.threadId,
          })
          .from(emails)
          .where(
            and(
              eq(emails.tenantId, tenantId),
              sql`NOT EXISTS (
                SELECT 1 FROM email_participants ep
                WHERE ep.email_id = ${emails.id}
              )`
            )
          )
          .limit(batchSize);

        return result;
      });

      if (emailsToProcess.length === 0) {
        logger.info({ tenantId }, 'No emails need participant backfill');
        return {
          success: true,
          processedCount: 0,
          message: 'No emails need backfill',
        };
      }

      logger.info(
        { tenantId, emailCount: emailsToProcess.length },
        'Found emails needing participant backfill'
      );

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          wouldProcess: emailsToProcess.length,
          sampleIds: emailsToProcess.slice(0, 5).map((e: { id: string }) => e.id),
        };
      }

      // Step 2: Process each email
      let processedCount = 0;
      let errorCount = 0;

      for (const email of emailsToProcess) {
        try {
          await step.run(`process-email-${email.id}`, async () => {
            const emailService = container.resolve(EmailService);
            const analysisService = container.resolve(EmailAnalysisService);
            const emailRepo = container.resolve(EmailRepository);

            // Fetch the full email record
            const dbEmail = await emailService.findById(email.id);
            if (!dbEmail) {
              logger.warn({ emailId: email.id }, 'Email not found during backfill');
              return;
            }

            // Convert to shared Email type
            const sharedEmail = dbEmailToEmail(dbEmail);

            // Get existing contacts for this email (from previous analysis)
            // We don't want to re-run LLM analysis, just create participants from existing data
            const contactRepo = container.resolve<any>('ContactRepository');

            // Extract all email addresses from the email
            const allAddresses: string[] = [];
            if (sharedEmail.from?.email) {
              allAddresses.push(sharedEmail.from.email.toLowerCase());
            }
            for (const to of sharedEmail.tos || []) {
              if (to.email) allAddresses.push(to.email.toLowerCase());
            }
            for (const cc of sharedEmail.ccs || []) {
              if (cc.email) allAddresses.push(cc.email.toLowerCase());
            }
            for (const bcc of sharedEmail.bccs || []) {
              if (bcc.email) allAddresses.push(bcc.email.toLowerCase());
            }

            // Look up existing contacts
            const existingContacts = await contactRepo.findByEmails(
              email.tenantId,
              allAddresses
            );

            // Build contacts array for participant creation
            const contacts: Array<{ id: string; email: string; customerId?: string }> = [];
            for (const [emailAddr, contact] of existingContacts.entries()) {
              contacts.push({
                id: contact.id,
                email: emailAddr,
                customerId: contact.customerId || undefined,
              });
            }

            // Call the private createEmailParticipants method via the service
            // We need to expose this or duplicate the logic here
            // For now, we'll use a simplified version
            await createParticipantsForEmail(
              email.tenantId,
              email.id,
              sharedEmail,
              contacts,
              emailRepo
            );
          });

          processedCount++;
        } catch (error: any) {
          logger.error(
            {
              error: { message: error.message, stack: error.stack },
              emailId: email.id,
              tenantId,
            },
            'Failed to backfill participants for email'
          );
          errorCount++;
        }
      }

      const hasMore = emailsToProcess.length === batchSize;

      logger.info(
        {
          tenantId,
          processedCount,
          errorCount,
          hasMore,
        },
        'Email participants backfill batch completed'
      );

      // If there are more emails, trigger next batch
      if (hasMore) {
        await inngest.send({
          name: 'email/backfill-participants',
          data: {
            tenantId,
            batchSize,
            dryRun: false,
          },
        });
      }

      return {
        success: true,
        processedCount,
        errorCount,
        hasMore,
      };
    }
  );
};

/**
 * Helper function to create participants for an email during backfill
 * Similar to EmailAnalysisService.createEmailParticipants but without the service dependency
 */
async function createParticipantsForEmail(
  tenantId: string,
  emailId: string,
  email: ReturnType<typeof dbEmailToEmail>,
  contacts: Array<{ id: string; email: string; customerId?: string }>,
  emailRepo: EmailRepository
): Promise<void> {
  const { UserRepository } = await import('../../users/repository');
  const { ContactRepository } = await import('../../contacts/repository');

  const userRepo = container.resolve(UserRepository);
  const contactRepo = container.resolve(ContactRepository);

  // Collect all unique email addresses
  const allEmailAddresses = new Set<string>();
  const emailDirections: Map<string, 'from' | 'to' | 'cc' | 'bcc'> = new Map();
  const emailNames: Map<string, string | undefined> = new Map();

  if (email.from?.email) {
    const fromEmail = email.from.email.toLowerCase();
    allEmailAddresses.add(fromEmail);
    emailDirections.set(fromEmail, 'from');
    emailNames.set(fromEmail, email.from.name);
  }

  for (const to of email.tos || []) {
    if (to.email) {
      const toEmail = to.email.toLowerCase();
      allEmailAddresses.add(toEmail);
      if (!emailDirections.has(toEmail)) {
        emailDirections.set(toEmail, 'to');
        emailNames.set(toEmail, to.name);
      }
    }
  }

  for (const cc of email.ccs || []) {
    if (cc.email) {
      const ccEmail = cc.email.toLowerCase();
      allEmailAddresses.add(ccEmail);
      if (!emailDirections.has(ccEmail)) {
        emailDirections.set(ccEmail, 'cc');
        emailNames.set(ccEmail, cc.name);
      }
    }
  }

  for (const bcc of email.bccs || []) {
    if (bcc.email) {
      const bccEmail = bcc.email.toLowerCase();
      allEmailAddresses.add(bccEmail);
      if (!emailDirections.has(bccEmail)) {
        emailDirections.set(bccEmail, 'bcc');
        emailNames.set(bccEmail, bcc.name);
      }
    }
  }

  if (allEmailAddresses.size === 0) {
    return;
  }

  const emailArray = Array.from(allEmailAddresses);
  const [usersMap, contactsMap] = await Promise.all([
    userRepo.findByEmails(tenantId, emailArray),
    contactRepo.findByEmails(tenantId, emailArray),
  ]);

  // Build map from provided contacts
  const providedContactsMap = new Map<string, { id: string; customerId?: string }>();
  for (const contact of contacts) {
    providedContactsMap.set(contact.email.toLowerCase(), {
      id: contact.id,
      customerId: contact.customerId,
    });
  }

  // Build participant records
  type NewEmailParticipant = {
    emailId: string;
    participantType: 'user' | 'contact';
    participantId: string;
    email: string;
    name?: string;
    direction: 'from' | 'to' | 'cc' | 'bcc';
    customerId: string | null;
  };

  const participants: NewEmailParticipant[] = [];

  for (const emailAddr of allEmailAddresses) {
    const direction = emailDirections.get(emailAddr) || 'to';
    const name = emailNames.get(emailAddr);

    const user = usersMap.get(emailAddr);
    if (user) {
      participants.push({
        emailId,
        participantType: 'user',
        participantId: user.id,
        email: emailAddr,
        name: name || `${user.firstName} ${user.lastName}`.trim(),
        direction,
        customerId: null,
      });
      continue;
    }

    const providedContact = providedContactsMap.get(emailAddr);
    const dbContact = contactsMap.get(emailAddr);
    const contact = providedContact || (dbContact ? { id: dbContact.id, customerId: dbContact.customerId || undefined } : null);

    if (contact) {
      participants.push({
        emailId,
        participantType: 'contact',
        participantId: contact.id,
        email: emailAddr,
        name: name || dbContact?.name || undefined,
        direction,
        customerId: contact.customerId || null,
      });
    }
  }

  if (participants.length > 0) {
    await emailRepo.createParticipants(participants);
    logger.debug(
      { tenantId, emailId, participantsCreated: participants.length },
      'Backfilled email participants'
    );
  }
}
