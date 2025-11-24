import { injectable } from '@crm/shared';
import { IntegrationClient, RunClient, EmailClient } from '@crm/clients';
import { GmailService } from './gmail';
import { EmailParserService } from './email-parser';
import { logger } from '../utils/logger';

@injectable()
export class SyncService {
  constructor(
    private integrationClient: IntegrationClient,
    private runClient: RunClient,
    private emailClient: EmailClient,
    private gmailService: GmailService,
    private emailParser: EmailParserService
  ) { }

  /**
   * Perform initial sync (last 30 days)
   */
  async initialSync(tenantId: string, runId: string): Promise<void> {
    logger.info({ tenantId, runId }, 'Starting initial sync');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 1); // FIXME: Change to 30 days

    const query = `after:${Math.floor(thirtyDaysAgo.getTime() / 1000)}`;
    logger.info({ tenantId, runId, query }, 'Initial sync query prepared');

    await this.syncEmails(tenantId, runId, 'initial', { query });

    logger.info({ tenantId, runId }, 'Initial sync completed');
  }

  /**
   * Perform incremental sync using History API
   */
  async incrementalSync(tenantId: string, runId: string): Promise<void> {
    logger.info({ tenantId, runId }, 'Starting incremental sync');

    // TEMPORARY: Disable history sync for debugging - always do initial sync
    logger.warn({ tenantId }, 'History sync disabled for debugging, performing initial sync instead');
    await this.initialSync(tenantId, runId);

    // Get the Gmail integration for this tenant
    const integration = await this.integrationClient.getByTenantAndSource(tenantId, 'gmail');

    if (!integration) {
      throw new Error(`Gmail integration not found for tenant ${tenantId}`);
    }

    if (!integration.lastRunToken) {
      logger.warn({ tenantId }, 'No history ID found, performing initial sync instead');
      await this.initialSync(tenantId, runId);
      return;
    }

    const { history, historyId: newHistoryId } = await this.gmailService.fetchHistory(
      tenantId,
      integration.lastRunToken,
      ['messageAdded']
    );

    if (!history || history.length === 0) {
      logger.info({ tenantId }, 'No new emails in history');
      await this.runClient.update(runId, {
        status: 'completed',
        completedAt: new Date(),
        itemsProcessed: 0,
      });
      return;
    }

    // Extract message IDs from history
    const messageIds: string[] = [];
    for (const historyItem of history) {
      if (historyItem.messagesAdded) {
        for (const added of historyItem.messagesAdded) {
          if (added.message?.id) {
            messageIds.push(added.message.id);
          }
        }
      }
    }

    logger.info({ tenantId, messageCount: messageIds.length }, 'Fetching messages from history');

    // Fetch and process messages
    await this.processMessageIds(tenantId, runId, messageIds);

    // Update history ID on integration
    await this.integrationClient.updateRunState(tenantId, 'gmail', {
      lastRunToken: newHistoryId,
      lastRunAt: new Date(),
    });
  }

  /**
   * Common sync logic
   */
  private async syncEmails(
    tenantId: string,
    runId: string,
    syncType: string,
    options: { query?: string; maxResults?: number } = {}
  ): Promise<void> {
    logger.info(
      { tenantId, runId, syncType, query: options.query, maxResults: options.maxResults },
      'syncEmails: Starting sync'
    );

    let totalProcessed = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let pageToken: string | undefined;
    let pageCount = 0;

    do {
      pageCount++;
      logger.info(
        { tenantId, runId, pageCount, pageToken: pageToken ? 'present' : 'none' },
        'syncEmails: Fetching page of messages'
      );

      const { messages, nextPageToken } = await this.gmailService.listMessages(tenantId, {
        query: options.query,
        maxResults: options.maxResults || 100,
        pageToken,
      });

      logger.info(
        { tenantId, runId, pageCount, messageCount: messages.length, hasNextPage: !!nextPageToken },
        'syncEmails: Fetched messages from Gmail'
      );

      if (messages.length === 0) {
        logger.info({ tenantId, runId, pageCount }, 'syncEmails: No messages in this page, breaking');
        break;
      }

      const messageIds = messages.map((m) => m.id!).filter(Boolean);
      logger.info(
        { tenantId, runId, pageCount, messageIdsCount: messageIds.length },
        'syncEmails: About to process message IDs'
      );

      const result = await this.processMessageIds(tenantId, runId, messageIds);

      logger.info(
        { tenantId, runId, pageCount, result },
        'syncEmails: Finished processing message IDs'
      );

      totalProcessed += result.processed;
      totalInserted += result.inserted;
      totalSkipped += result.skipped;

      pageToken = nextPageToken;

      logger.info(
        { tenantId, totalProcessed, totalInserted, totalSkipped, pageCount },
        'Sync progress'
      );

      // Update run progress
      await this.runClient.update(runId, {
        itemsProcessed: totalProcessed,
        itemsInserted: totalInserted,
        itemsSkipped: totalSkipped,
      });
    } while (pageToken);

    logger.info(
      { tenantId, runId, totalProcessed, totalInserted, totalSkipped, totalPages: pageCount },
      'syncEmails: Completed all pages'
    );

    // Get current history ID for future incremental syncs
    const historyId = await this.gmailService.getCurrentHistoryId(tenantId);

    // Update integration run state
    await this.integrationClient.updateRunState(tenantId, 'gmail', {
      lastRunToken: historyId,
      lastRunAt: new Date(),
    });

    // Mark run as completed
    await this.runClient.update(runId, {
      status: 'completed',
      completedAt: new Date(),
      endToken: historyId,
    });
  }

  /**
   * Process a batch of message IDs
   */
  private async processMessageIds(
    tenantId: string,
    runId: string,
    messageIds: string[]
  ): Promise<{ processed: number; inserted: number; skipped: number }> {
    logger.info(
      { tenantId, runId, messageIdsCount: messageIds.length },
      'processMessageIds: Starting to process message IDs'
    );

    if (messageIds.length === 0) {
      logger.info({ tenantId, runId }, 'processMessageIds: No message IDs to process');
      return { processed: 0, inserted: 0, skipped: 0 };
    }

    try {
      // Get integration to get integration ID
      logger.info({ tenantId, runId }, 'processMessageIds: Fetching integration');
      const integration = await this.integrationClient.getByTenantAndSource(tenantId, 'gmail');
      if (!integration) {
        throw new Error(`Gmail integration not found for tenant ${tenantId}`);
      }

      logger.info(
        { tenantId, runId, integrationId: integration.id },
        'processMessageIds: Integration found, fetching messages'
      );

      // Fetch full message details
      const messages = await this.gmailService.batchGetMessages(tenantId, messageIds);

      logger.info({ tenantId, messageCount: messages.length }, 'Fetched messages, now parsing');

      // Parse messages to provider-agnostic format (groups by thread)
      const emailCollections = this.emailParser.parseMessages(messages, 'gmail');

      logger.info(
        { tenantId, threadCount: emailCollections.length, emailCount: messages.length },
        'Parsed emails into threads, now bulk inserting via API'
      );

      // Call API endpoint which will handle Inngest orchestration
      // If API fails, we'll throw error so webhook returns 500 to Pub/Sub for retry
      logger.info(
        {
          tenantId,
          integrationId: integration.id,
          runId,
          emailCollectionsCount: emailCollections.length,
          apiBaseUrl: process.env.API_BASE_URL || 'not set',
        },
        'Calling API bulkInsertWithThreads endpoint'
      );

      // If API fails, it will return 500 and we'll throw error
      // This causes webhook to return 500 to Pub/Sub for retry
      const result = await this.emailClient.bulkInsertWithThreads(
        tenantId,
        integration.id,
        emailCollections,
        runId // Pass runId so Inngest can update run status
      );

      logger.info(
        { tenantId, runId, result },
        'Bulk insert API call completed successfully (queued to Inngest)'
      );

      // Return optimistic counts - actual counts will be updated by Inngest function
      // Inngest function will update run status when it completes
      return {
        processed: messages.length,
        inserted: result.insertedCount || 0,
        skipped: result.skippedCount || 0,
      };
    } catch (error: any) {
      logger.error({
        tenantId,
        messageIdsCount: messageIds.length,
        error: {
          message: error.message,
          stack: error.stack,
          status: error.status,
          responseBody: error.responseBody,
          responseBodyParsed: error.responseBodyParsed,
        },
        apiBaseUrl: process.env.API_BASE_URL,
      }, 'Failed to process messages - check error details above');
      throw error;
    }
  }
}
