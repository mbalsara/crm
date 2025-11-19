import { injectable, inject } from '@crm/shared';
import { EmailRepository } from './repository';
import { EmailThreadRepository } from './thread-repository';
import type { NewEmail, NewEmailThread } from './schema';
import { EmailAnalysisStatus } from './schema';
import { threadToDb, emailToDb } from './converter';
import { emailCollectionSchema, type EmailCollection, type Email } from '@crm/shared';
import type { Database } from '@crm/database';
import { emails, emailThreads } from './schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

@injectable()
export class EmailService {
  constructor(
    private emailRepo: EmailRepository,
    private threadRepo: EmailThreadRepository,
    @inject('Database') private db: Database
  ) {}

  /**
   * Bulk insert emails with threads
   * Accepts email collections and handles thread creation/updates
   * Validates input using Zod schemas
   */
  async bulkInsertWithThreads(
    tenantId: string,
    integrationId: string,
    emailCollections: EmailCollection[]
  ): Promise<{ insertedCount: number; skippedCount: number; threadsCreated: number }> {
    if (!emailCollections || !Array.isArray(emailCollections)) {
      throw new Error('emailCollections array is required');
    }

    if (!integrationId) {
      throw new Error('integrationId is required');
    }

    // Validate all email collections
    for (let i = 0; i < emailCollections.length; i++) {
      try {
        emailCollectionSchema.parse(emailCollections[i]);
      } catch (error: any) {
        throw new Error(`Invalid email collection at index ${i}: ${error.message}`);
      }
    }

    let totalInserted = 0;
    let totalSkipped = 0;
    let threadsCreated = 0;
    const emailsToAnalyze: Array<{ emailId: string; threadId: string }> = [];

    for (const collection of emailCollections) {
      // Save thread and emails transactionally
      // Ensures data consistency: either both succeed or both fail
      const result = await this.saveThreadWithEmailsTransactionally(
        tenantId,
        integrationId,
        collection
      );

      threadsCreated += result.threadCreated ? 1 : 0;
      totalInserted += result.insertedCount;
      totalSkipped += result.skippedCount;

      // Collect emails that need analysis
      for (const emailId of result.emailsToAnalyze) {
        emailsToAnalyze.push({
          emailId,
          threadId: result.threadId,
        });
      }
    }

    // Trigger analysis for emails that need it (outside transaction)
    // If Inngest event send fails, email is still saved and can be retried later
    for (const { emailId, threadId } of emailsToAnalyze) {
      await this.triggerEmailAnalysis(tenantId, emailId, threadId);
    }

    return {
      insertedCount: totalInserted,
      skippedCount: totalSkipped,
      threadsCreated,
    };
  }

  /**
   * Bulk insert emails (legacy method for backward compatibility)
   * @deprecated Use bulkInsertWithThreads instead
   */
  async bulkInsert(emails: NewEmail[]) {
    if (!emails || !Array.isArray(emails)) {
      throw new Error('emails array is required');
    }

    return this.emailRepo.bulkInsert(emails);
  }

  /**
   * List emails for tenant with pagination
   */
  async findByTenant(tenantId: string, options?: { limit?: number; offset?: number }) {
    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const emails = await this.emailRepo.findByTenant(tenantId, { limit, offset });

    return {
      emails,
      count: emails.length,
      limit,
      offset,
    };
  }

  /**
   * Get emails by thread
   */
  async findById(tenantId: string, emailId: string) {
    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    if (!emailId) {
      throw new Error('emailId is required');
    }

    return this.emailRepo.findById(tenantId, emailId);
  }

  async findByThread(tenantId: string, threadId: string) {
    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    if (!threadId) {
      throw new Error('threadId is required');
    }

    const emails = await this.emailRepo.findByThread(tenantId, threadId);

    return {
      emails,
      threadId,
      count: emails.length,
    };
  }

  /**
   * Check if email exists
   */
  async exists(tenantId: string, provider: string, messageId: string): Promise<boolean> {
    if (!tenantId || !provider || !messageId) {
      throw new Error('tenantId, provider, and messageId are required');
    }

    return this.emailRepo.exists(tenantId, provider, messageId);
  }

  /**
   * Save thread and emails atomically in a transaction
   * Ensures data consistency: either both are saved or neither
   * Returns emails that need analysis (new or changed)
   */
  private async saveThreadWithEmailsTransactionally(
    tenantId: string,
    integrationId: string,
    collection: EmailCollection
  ): Promise<{
    threadId: string;
    threadCreated: boolean;
    insertedCount: number;
    skippedCount: number;
    emailsToAnalyze: string[]; // Email IDs that need analysis
  }> {
    const threadDb = threadToDb(collection.thread, tenantId, integrationId);

    return await this.db.transaction(async (tx) => {
      // Step 1: Upsert thread atomically
      const threadResult = await tx
        .insert(emailThreads)
        .values(threadDb)
        .onConflictDoUpdate({
          target: [
            emailThreads.tenantId,
            emailThreads.integrationId,
            emailThreads.providerThreadId,
          ],
          set: {
            subject: threadDb.subject,
            lastMessageAt: sql`GREATEST(${emailThreads.lastMessageAt}, EXCLUDED.last_message_at)`,
            messageCount: sql`${emailThreads.messageCount} + EXCLUDED.message_count`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
        .returning({ id: emailThreads.id });

      const threadId = threadResult[0].id;
      const threadCreated = threadResult.length > 0;

      // Step 2: Convert emails to database format with thread ID
      const emailsDb: NewEmail[] = collection.emails.map((email) =>
        emailToDb(email, tenantId, threadId, integrationId)
      );

      // Step 3: Check existing emails before insert/update (for change detection)
      const existingEmailsMap = new Map<string, { id: string; body: string | null; analysisStatus: EmailAnalysisStatus | null }>();
      
      if (emailsDb.length > 0) {
        const messageIds = emailsDb.map(e => e.messageId);
        const existingEmails = await tx
          .select({
            id: emails.id,
            messageId: emails.messageId,
            body: emails.body,
            analysisStatus: emails.analysisStatus,
          })
          .from(emails)
          .where(
            and(
              eq(emails.tenantId, tenantId),
              eq(emails.provider, collection.thread.provider),
              inArray(emails.messageId, messageIds)
            )
          );

        for (const existing of existingEmails) {
          existingEmailsMap.set(existing.messageId, {
            id: existing.id,
            body: existing.body,
            analysisStatus: existing.analysisStatus || null,
          });
        }
      }

      // Step 4: Bulk insert emails atomically (skip duplicates)
      const insertedEmails = await tx
        .insert(emails)
        .values(emailsDb)
        .onConflictDoUpdate({
          target: [emails.tenantId, emails.provider, emails.messageId],
          set: {
            body: sql`EXCLUDED.body`,
            subject: sql`EXCLUDED.subject`,
            metadata: sql`EXCLUDED.metadata`,
            labels: sql`EXCLUDED.labels`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })
        .returning({
          id: emails.id,
          messageId: emails.messageId,
        });

      // Step 5: Determine which emails need analysis (within transaction)
      const emailsToAnalyze: string[] = [];

      for (const emailResult of insertedEmails) {
        const originalEmail = collection.emails.find(
          (e) => e.messageId === emailResult.messageId && e.provider === collection.thread.provider
        );

        if (!originalEmail) {
          continue; // Skip if we can't find original email
        }

        const existing = existingEmailsMap.get(emailResult.messageId);

        if (!existing) {
          // New email - always analyze
          emailsToAnalyze.push(emailResult.id);
        } else {
          // Existing email - check if body content changed and not already analyzed
          const hasChanged = this.emailBodyChanged(
            existing.body,
            originalEmail.body || ''
          );
          const alreadyAnalyzed = existing.analysisStatus === EmailAnalysisStatus.Completed;

          if (hasChanged && !alreadyAnalyzed) {
            emailsToAnalyze.push(emailResult.id);
          }
        }
      }

      // Calculate inserted vs updated counts
      const insertedCount = insertedEmails.filter(
        (e) => !existingEmailsMap.has(e.messageId)
      ).length;
      const updatedCount = insertedEmails.filter((e) =>
        existingEmailsMap.has(e.messageId)
      ).length;
      const skippedCount = emailsDb.length - insertedEmails.length;

      // Transaction commits here - ALL OR NOTHING
      // If anything fails, entire transaction rolls back
      return {
        threadId,
        threadCreated,
        insertedCount,
        skippedCount,
        emailsToAnalyze,
      };
    });
  }

  /**
   * Check if email body content has changed
   * Only compares body hash (ignores labels, metadata, etc.)
   */
  private emailBodyChanged(
    currentBody: string | null,
    newBody: string
  ): boolean {
    // Compare body hash
    const currentBodyHash = this.hashString(currentBody || '');
    const newBodyHash = this.hashString(newBody || '');

    return currentBodyHash !== newBodyHash;
  }

  /**
   * Hash a string for comparison (SHA256 hash)
   */
  private hashString(str: string): string {
    return createHash('sha256').update(str).digest('hex');
  }

  /**
   * Trigger durable email analysis via Inngest
   * This ensures analysis survives service restarts and failures
   */
  private async triggerEmailAnalysis(
    tenantId: string,
    emailId: string,
    threadId: string
  ): Promise<void> {
    try {
      // Import Inngest client dynamically to avoid circular dependencies
      const { inngest } = await import('../inngest/client');

      // Send event to Inngest for durable processing
      // Inngest will retry automatically on failures and survive restarts
      await inngest.send({
        name: 'email/inserted',
        data: {
          tenantId,
          emailId, // Database UUID
          threadId, // Database UUID
          // NO email content - fetched from DB when processing
        },
      });

      logger.info(
        {
          tenantId,
          emailId,
          threadId,
        },
        'Triggered durable email analysis via Inngest'
      );
    } catch (error: any) {
      // Log error but don't fail email insertion
      // Email is already saved, analysis can be retried later
      logger.error(
        {
          error: {
            message: error.message,
            stack: error.stack,
          },
          tenantId,
          emailId,
          threadId,
        },
        'Failed to trigger email analysis (email saved, analysis will be retried)'
      );
    }
  }
}
