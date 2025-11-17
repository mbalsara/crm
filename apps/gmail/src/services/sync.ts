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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 1); // FIXME: Change to 30 days

    const query = `after:${Math.floor(thirtyDaysAgo.getTime() / 1000)}`;

    await this.syncEmails(tenantId, runId, 'initial', { query });
  }

  /**
   * Perform incremental sync using History API
   */
  async incrementalSync(tenantId: string, runId: string): Promise<void> {
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
    let totalProcessed = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let pageToken: string | undefined;

    do {
      const { messages, nextPageToken } = await this.gmailService.listMessages(tenantId, {
        query: options.query,
        maxResults: options.maxResults || 100,
        pageToken,
      });

      if (messages.length === 0) break;

      const messageIds = messages.map((m) => m.id!).filter(Boolean);
      const result = await this.processMessageIds(tenantId, runId, messageIds);

      totalProcessed += result.processed;
      totalInserted += result.inserted;
      totalSkipped += result.skipped;

      pageToken = nextPageToken;

      logger.info(
        { tenantId, totalProcessed, totalInserted, totalSkipped },
        'Sync progress'
      );

      // Update run progress
      await this.runClient.update(runId, {
        itemsProcessed: totalProcessed,
        itemsInserted: totalInserted,
        itemsSkipped: totalSkipped,
      });
    } while (pageToken);

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
    if (messageIds.length === 0) {
      return { processed: 0, inserted: 0, skipped: 0 };
    }

    try {
      // Get integration to get integration ID
      const integration = await this.integrationClient.getByTenantAndSource(tenantId, 'gmail');
      if (!integration) {
        throw new Error(`Gmail integration not found for tenant ${tenantId}`);
      }

      // Fetch full message details
      const messages = await this.gmailService.batchGetMessages(tenantId, messageIds);

      logger.info({ tenantId, messageCount: messages.length }, 'Fetched messages, now parsing');

      // Parse messages to provider-agnostic format (groups by thread)
      const emailCollections = this.emailParser.parseMessages(messages, 'gmail');

      logger.info(
        { tenantId, threadCount: emailCollections.length, emailCount: messages.length },
        'Parsed emails into threads, now bulk inserting'
      );

      // Bulk insert with threads (will skip duplicates)
      const { insertedCount, skippedCount, threadsCreated } =
        await this.emailClient.bulkInsertWithThreads(
          tenantId,
          integration.id,
          emailCollections
        );

      logger.info(
        { tenantId, insertedCount, skippedCount, threadsCreated },
        'Bulk insert completed'
      );

      return {
        processed: messages.length,
        inserted: insertedCount,
        skipped: skippedCount,
      };
    } catch (error: any) {
      logger.error({ error, tenantId, messageIds: messageIds.length }, 'Failed to process messages');
      throw error;
    }
  }
}
