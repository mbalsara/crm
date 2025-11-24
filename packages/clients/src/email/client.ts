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
   * API will send to Inngest for async processing
   */
  async bulkInsertWithThreads(
    tenantId: string,
    integrationId: string,
    emailCollections: EmailCollection[],
    runId?: string // Optional - for tracking run status updates
  ): Promise<{ insertedCount: number; skippedCount: number; threadsCreated: number }> {
    // Log the request details for debugging
    console.log('[EmailClient] Calling bulkInsertWithThreads', {
      baseUrl: this.baseUrl,
      endpoint: '/api/emails/bulk-with-threads',
      tenantId,
      integrationId,
      runId,
      emailCollectionsCount: emailCollections.length,
      totalEmails: emailCollections.reduce((sum, col) => sum + col.emails.length, 0),
    });

    try {
      const result = await this.post<{ insertedCount: number; skippedCount: number; threadsCreated: number }>(
        '/api/emails/bulk-with-threads',
        { tenantId, integrationId, emailCollections, runId }
      );

      console.log('[EmailClient] bulkInsertWithThreads succeeded', {
        insertedCount: result.insertedCount,
        skippedCount: result.skippedCount,
        threadsCreated: result.threadsCreated,
      });

      return result;
    } catch (error: any) {
      console.error('[EmailClient] bulkInsertWithThreads FAILED', {
        baseUrl: this.baseUrl,
        endpoint: '/api/emails/bulk-with-threads',
        tenantId,
        integrationId,
        runId,
        error: {
          message: error.message,
          stack: error.stack,
          status: error.status,
          responseBody: error.responseBody,
        },
      });
      throw error;
    }
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
