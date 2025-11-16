import { injectable } from '@crm/shared';
import { EmailRepository } from './repository';
import type { NewEmail } from './schema';

@injectable()
export class EmailService {
  constructor(private emailRepo: EmailRepository) {}

  /**
   * Bulk insert emails
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
  async exists(tenantId: string, gmailMessageId: string): Promise<boolean> {
    if (!tenantId || !gmailMessageId) {
      throw new Error('tenantId and gmailMessageId are required');
    }

    return this.emailRepo.exists(tenantId, gmailMessageId);
  }
}
