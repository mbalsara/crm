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
   * Skips messages that return 404 (deleted/trashed/spam) - these are expected
   * when using History API since messages can be deleted after history event
   * Handles 401 by refreshing token in onRetry
   */
  async batchGetMessages(tenantId: string, messageIds: string[]): Promise<gmail_v1.Schema$Message[]> {
    let gmail = await this.getClient(tenantId);
    const messages: gmail_v1.Schema$Message[] = [];
    let skippedCount = 0;

    // Process sequentially to avoid rate limiting (Gmail API has strict quotas)
    logger.info({ tenantId, totalMessages: messageIds.length }, 'Fetching messages sequentially to avoid rate limits');

    for (let i = 0; i < messageIds.length; i++) {
      try {
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
            shouldRetry: (error) => {
              const statusCode = error?.code || error?.response?.status;
              // Retry on rate limit (429), quota exceeded (403), or token expired (401)
              return statusCode === 429 || statusCode === 403 || statusCode === 401;
            },
            onRetry: async (attempt, error) => {
              const statusCode = error?.code || error?.response?.status;
              const errorMessage = error?.message || error?.response?.statusText || 'Unknown error';
              const backoffMs = Math.min(1000 * Math.pow(2, attempt), 32000);

              // If 401, refresh token before retry
              if (statusCode === 401) {
                logger.warn(
                  { tenantId, messageId: messageIds[i], attempt: attempt + 1 },
                  'Token expired (401), refreshing before retry'
                );
                await this.clientFactory.ensureValidTokenAndRefresh(tenantId);
                gmail = await this.getClient(tenantId);
              } else {
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
              }
            },
          }
        );

        messages.push(message);
      } catch (error: any) {
        const statusCode = error?.code || error?.response?.status;

        // Skip 404 errors - message was deleted/trashed/spam since history event
        if (statusCode === 404) {
          skippedCount++;
          logger.info(
            { tenantId, messageId: messageIds[i], reason: 'Message not found (deleted/trashed/spam)' },
            'Skipping message that no longer exists'
          );
          continue;
        }

        // For other errors (or exhausted retries), log and break to save what we have
        logger.error(
          { tenantId, messageId: messageIds[i], statusCode, error: error.message, fetchedSoFar: messages.length },
          'Error fetching message, returning collected messages for checkpointing'
        );
        break;
      }

      // Delay between each request to stay well under rate limits
      if (i < messageIds.length - 1) {
        await this.sleep(200);
      }

      // Log progress every 10 messages
      if ((i + 1) % 10 === 0) {
        logger.info({ tenantId, fetched: i + 1, total: messageIds.length }, 'Fetch progress');
      }
    }

    if (skippedCount > 0) {
      logger.info(
        { tenantId, skippedCount, fetchedCount: messages.length, totalRequested: messageIds.length },
        'Completed batch fetch with some messages skipped (deleted/trashed/spam)'
      );
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
