import { injectable, withRetry } from '@crm/shared';
import { gmail_v1 } from 'googleapis';
import { GmailClientFactory } from './gmail-client-factory';
import { logger } from '../utils/logger';

interface FetchEmailsOptions {
  maxResults?: number;
  pageToken?: string;
  query?: string;
  labelIds?: string[];
}

@injectable()
export class GmailService {
  constructor(private clientFactory: GmailClientFactory) {}

  /**
   * Get Gmail API client for tenant
   */
  private async getClient(tenantId: string): Promise<gmail_v1.Gmail> {
    return this.clientFactory.getClient(tenantId);
  }

  /**
   * Fetch message list with pagination
   */
  async listMessages(
    tenantId: string,
    options: FetchEmailsOptions = {}
  ): Promise<{ messages: gmail_v1.Schema$Message[]; nextPageToken?: string }> {
    return withRetry(
      async () => {
        const gmail = await this.getClient(tenantId);

        const response = await gmail.users.messages.list({
          userId: 'me',
          maxResults: options.maxResults || 100,
          pageToken: options.pageToken,
          q: options.query,
          labelIds: options.labelIds,
        });

        return {
          messages: response.data.messages || [],
          nextPageToken: response.data.nextPageToken || undefined,
        };
      },
      {
        onRetry: (attempt, error) => {
          const statusCode = error?.code || error?.response?.status;
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 32000);
          logger.warn({ attempt: attempt + 1, backoffMs }, 'Rate limit hit, retrying');
        },
      }
    );
  }

  /**
   * Get full message details
   */
  async getMessage(tenantId: string, messageId: string): Promise<gmail_v1.Schema$Message> {
    return withRetry(async () => {
      const gmail = await this.getClient(tenantId);

      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      return response.data;
    });
  }

  /**
   * Batch get messages (more efficient than individual gets)
   */
  async batchGetMessages(tenantId: string, messageIds: string[]): Promise<gmail_v1.Schema$Message[]> {
    const gmail = await this.getClient(tenantId);
    const messages: gmail_v1.Schema$Message[] = [];

    // Process in batches of 50 (Gmail API limit)
    const batchSize = 50;
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);

      const batchMessages = await Promise.all(
        batch.map((id) =>
          withRetry(async () => {
            const response = await gmail.users.messages.get({
              userId: 'me',
              id,
              format: 'full',
            });
            return response.data;
          })
        )
      );

      messages.push(...batchMessages);

      // Rate limit protection - small delay between batches
      if (i + batchSize < messageIds.length) {
        await this.sleep(100);
      }
    }

    return messages;
  }

  /**
   * Fetch emails using History API (for incremental sync)
   */
  async fetchHistory(
    tenantId: string,
    startHistoryId: string,
    historyTypes?: string[]
  ): Promise<{ history: gmail_v1.Schema$History[]; historyId: string }> {
    return withRetry(async () => {
      const gmail = await this.getClient(tenantId);

      const response = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: historyTypes || ['messageAdded'],
        maxResults: 500,
      });

      return {
        history: response.data.history || [],
        historyId: response.data.historyId || startHistoryId,
      };
    });
  }

  /**
   * Get current history ID (used to initialize watch)
   */
  async getCurrentHistoryId(tenantId: string): Promise<string> {
    return withRetry(async () => {
      const gmail = await this.getClient(tenantId);

      const response = await gmail.users.getProfile({
        userId: 'me',
      });

      if (!response.data.historyId) {
        throw new Error('Failed to get current history ID');
      }

      return response.data.historyId;
    });
  }

  /**
   * Set up Gmail push notifications
   */
  async setupWatch(
    tenantId: string,
    topicName: string
  ): Promise<{ historyId: string; expiration: string }> {
    return withRetry(async () => {
      const gmail = await this.getClient(tenantId);

      const response = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName,
          labelIds: ['INBOX'], // Only watch inbox, customize as needed
        },
      });

      return {
        historyId: response.data.historyId!,
        expiration: response.data.expiration!,
      };
    });
  }

  /**
   * Stop Gmail push notifications
   */
  async stopWatch(tenantId: string): Promise<void> {
    return withRetry(async () => {
      const gmail = await this.getClient(tenantId);

      await gmail.users.stop({
        userId: 'me',
      });
    });
  }

}
