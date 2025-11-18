import type { EmailCollection } from '@crm/shared';
import { BaseClient } from '../base-client';

// Import legacy NewEmail type from API module where schema is defined
// This is only used for backward compatibility with old bulk insert endpoint
// Note: Clients typically shouldn't need database types - prefer using API types
import type { NewEmail } from '@crm/api/emails/schema';

/**
 * Client for email-related API operations
 */
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
