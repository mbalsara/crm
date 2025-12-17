import type { EmailCollection } from '@crm/shared';
import { BaseClient } from '../base-client';

/**
 * Email input type for bulk insert API
 * This is the API contract - not tied to database schema
 */
export interface NewEmailInput {
  tenantId: string;
  threadId: string;
  integrationId?: string | null;
  provider: string;
  messageId: string;
  subject: string;
  body?: string | null;
  fromEmail: string;
  fromName?: string | null;
  tos?: Array<{ email: string; name?: string }> | null;
  ccs?: Array<{ email: string; name?: string }> | null;
  bccs?: Array<{ email: string; name?: string }> | null;
  priority?: string;
  labels?: string[] | null;
  receivedAt: Date | string;
  metadata?: Record<string, any> | null;
}

/**
 * Email response type from API
 */
export interface EmailResponse {
  id: string;
  tenantId: string;
  threadId: string;
  integrationId?: string | null;
  provider: string;
  messageId: string;
  subject: string;
  body?: string | null;
  fromEmail: string;
  fromName?: string | null;
  tos?: Array<{ email: string; name?: string }> | null;
  ccs?: Array<{ email: string; name?: string }> | null;
  bccs?: Array<{ email: string; name?: string }> | null;
  priority: string;
  labels?: string[] | null;
  receivedAt: string;
  metadata?: Record<string, any> | null;
  sentiment?: string | null;
  sentimentScore?: string | null;
  analysisStatus?: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response from getByCustomer API
 */
export interface EmailsByCustomerResponse {
  emails: EmailResponse[];
  total: number;
  count: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

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
  async bulkInsert(emails: NewEmailInput[]): Promise<{ insertedCount: number; skippedCount: number }> {
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

  /**
   * Get emails by customer (via domain matching)
   */
  async getByCustomer(
    tenantId: string,
    customerId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<EmailsByCustomerResponse> {
    const params = new URLSearchParams({ tenantId });
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());

    return this.get<EmailsByCustomerResponse>(
      `/api/emails/customer/${encodeURIComponent(customerId)}?${params.toString()}`
    );
  }
}
