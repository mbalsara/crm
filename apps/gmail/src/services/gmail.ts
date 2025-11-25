import { withRetry } from '@crm/shared';
import { gmail_v1 } from 'googleapis';
import { GmailClientFactory } from './gmail-client-factory';
import { logger } from '../utils/logger';

interface FetchEmailsOptions {
  maxResults?: number;
  pageToken?: string;
  query?: string;
  labelIds?: string[];
}

export class GmailService {
  constructor(private clientFactory: GmailClientFactory) {}

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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
          const errorMessage = error?.message || error?.response?.statusText || 'Unknown error';
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 32000);
          logger.warn(
            {
              method: 'users.messages.list',
              attempt: attempt + 1,
              statusCode,
              errorMessage,
              backoffMs,
            },
            'Rate limit hit, retrying'
          );
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
   * Batch get messages with controlled concurrency to avoid rate limits
   */
  async batchGetMessages(tenantId: string, messageIds: string[]): Promise<gmail_v1.Schema$Message[]> {
    const gmail = await this.getClient(tenantId);
    const messages: gmail_v1.Schema$Message[] = [];

    // Process sequentially to avoid rate limiting (Gmail API has strict quotas)
    logger.info({ tenantId, totalMessages: messageIds.length }, 'Fetching messages sequentially to avoid rate limits');

    for (let i = 0; i < messageIds.length; i++) {
      const message = await withRetry(
        async () => {
          const response = await gmail.users.messages.get({
            userId: 'me',
            id: messageIds[i],
            format: 'full',
          });
          return response.data;
        },
        {
          onRetry: (attempt, error) => {
            const statusCode = error?.code || error?.response?.status;
            const errorMessage = error?.message || error?.response?.statusText || 'Unknown error';
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 32000);
            logger.warn(
              {
                method: 'users.messages.get',
                messageId: messageIds[i],
                attempt: attempt + 1,
                statusCode,
                errorMessage,
                backoffMs,
              },
              'Rate limit hit, retrying'
            );
          },
        }
      );

      messages.push(message);

      // Delay between each request to stay well under rate limits
      // Gmail API has a quota of 250 quota units per user per second
      // messages.get costs 5 quota units, so max 50 requests/second
      // We'll do 1 request per 200ms = 5 requests/second to be very conservative
      if (i < messageIds.length - 1) {
        await this.sleep(200);
      }

      // Log progress every 10 messages
      if ((i + 1) % 10 === 0) {
        logger.info({ tenantId, fetched: i + 1, total: messageIds.length }, 'Fetch progress');
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
