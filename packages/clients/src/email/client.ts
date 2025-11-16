import { injectable } from 'tsyringe';
import type { NewEmail } from '@crm/database';
import { BaseClient } from '../base-client';

/**
 * Client for email-related API operations
 */
@injectable()
export class EmailClient extends BaseClient {
  /**
   * Bulk insert emails
   */
  async bulkInsert(emails: NewEmail[]): Promise<{ insertedCount: number; skippedCount: number }> {
    return await this.post<{ insertedCount: number; skippedCount: number }>(
      '/api/emails/bulk',
      { emails }
    );
  }

  /**
   * Check if email exists
   */
  async exists(tenantId: string, gmailMessageId: string): Promise<boolean> {
    const response = await this.get<{ exists: boolean }>(
      `/api/emails/exists?tenantId=${encodeURIComponent(tenantId)}&gmailMessageId=${encodeURIComponent(gmailMessageId)}`
    );
    return response?.exists ?? false;
  }
}
