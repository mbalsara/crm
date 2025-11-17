import { injectable } from '@crm/shared';
import { EmailRepository } from './repository';
import { EmailThreadRepository } from './thread-repository';
import type { NewEmail, NewEmailThread } from './schema';
import { threadToDb, emailToDb } from './converter';
import { emailResultSchema, type EmailResult } from '@crm/shared';

@injectable()
export class EmailService {
  constructor(
    private emailRepo: EmailRepository,
    private threadRepo: EmailThreadRepository
  ) {}

  /**
   * Bulk insert emails with threads
   * Accepts email results and handles thread creation/updates
   * Validates input using Zod schemas
   */
  async bulkInsertWithThreads(
    tenantId: string,
    integrationId: string,
    emailResults: EmailResult[]
  ): Promise<{ insertedCount: number; skippedCount: number; threadsCreated: number }> {
    if (!emailResults || !Array.isArray(emailResults)) {
      throw new Error('emailResults array is required');
    }

    if (!integrationId) {
      throw new Error('integrationId is required');
    }

    // Validate all email results
    for (let i = 0; i < emailResults.length; i++) {
      try {
        emailResultSchema.parse(emailResults[i]);
      } catch (error: any) {
        throw new Error(`Invalid email result at index ${i}: ${error.message}`);
      }
    }

    let totalInserted = 0;
    let totalSkipped = 0;
    let threadsCreated = 0;

    for (const result of emailResults) {
      // Upsert thread first (integrationId is required, provider derived from integration)
      const threadDb = threadToDb(result.thread, tenantId, integrationId);
      const threadId = await this.threadRepo.upsertThread(threadDb);
      threadsCreated++;

      // Convert emails to database format with thread ID
      const emailsDb: NewEmail[] = result.emails.map((email) =>
        emailToDb(email, tenantId, threadId, integrationId)
      );

      // Bulk insert emails for this thread
      const emailResult = await this.emailRepo.bulkInsert(emailsDb);
      totalInserted += emailResult.insertedCount;
      totalSkipped += emailResult.skippedCount;
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
}
