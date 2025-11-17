import { injectable, inject } from '@crm/shared';
import type { Database } from '@crm/database';
import { emails, type NewEmail } from './schema';
import { eq, and, desc} from 'drizzle-orm';
import { logger } from '../utils/logger';

@injectable()
export class EmailRepository {
  constructor(@inject('Database') private db: Database) {}

  async bulkInsert(emailData: NewEmail[]) {
    if (emailData.length === 0) {
      return { insertedCount: 0, skippedCount: 0 };
    }

    try {
      // Insert emails, skip duplicates based on (tenantId, gmailMessageId) unique constraint
      const result = await this.db
        .insert(emails)
        .values(emailData)
        .onConflictDoNothing({ target: [emails.tenantId, emails.gmailMessageId] })
        .returning({ id: emails.id });

      return {
        insertedCount: result.length,
        skippedCount: emailData.length - result.length,
      };
    } catch (error: any) {
      logger.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          code: error.code,
        },
        emailCount: emailData.length,
        sampleTenantId: emailData[0]?.tenantId,
      }, 'Failed to bulk insert emails');
      throw error;
    }
  }

  async findByTenant(tenantId: string, options?: { limit?: number; offset?: number }) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    return this.db
      .select()
      .from(emails)
      .where(eq(emails.tenantId, tenantId))
      .orderBy(desc(emails.receivedAt))
      .limit(limit)
      .offset(offset);
  }

  async findByThread(tenantId: string, threadId: string) {
    return this.db
      .select()
      .from(emails)
      .where(and(eq(emails.tenantId, tenantId), eq(emails.gmailThreadId, threadId)))
      .orderBy(desc(emails.receivedAt));
  }

  async exists(tenantId: string, gmailMessageId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: emails.id })
      .from(emails)
      .where(and(eq(emails.tenantId, tenantId), eq(emails.gmailMessageId, gmailMessageId)))
      .limit(1);

    return result.length > 0;
  }
}
