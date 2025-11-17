import { injectable } from 'tsyringe';
import type { NewEmail } from '@crm/database';
import type { EmailCollection } from '@crm/shared';
import { BaseClient } from '../base-client';

/**
 * Client for email-related API operations
 */
@injectable()
export class EmailClient extends BaseClient {
  /**
   * Bulk insert emails with threads (new provider-agnostic format)
   */
  async bulkInsertWithThreads(
    tenantId: string,
    integrationId: string,
    emailCollections: EmailCollection[]
  ): Promise<{ insertedCount: number; skippedCount: number; threadsCreated: number }> {
    return await this.post<{ insertedCount: number; skippedCount: number; threadsCreated: number }>(
      '/api/emails/bulk-with-threads',
      { tenantId, integrationId, emailCollections }
    );
  }

  /**
   * Bulk insert emails (legacy method for backward compatibility)
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
  async exists(tenantId: string, provider: string, messageId: string): Promise<boolean> {
    const response = await this.get<{ exists: boolean }>(
      `/api/emails/exists?tenantId=${encodeURIComponent(tenantId)}&provider=${encodeURIComponent(provider)}&messageId=${encodeURIComponent(messageId)}`
    );
    return response?.exists ?? false;
  }
}
