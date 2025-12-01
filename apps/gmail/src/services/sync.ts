import { IntegrationClient, RunClient, EmailClient } from '@crm/clients';
import { GmailService } from './gmail';
import { EmailParserService } from './email-parser';
import { logger } from '../utils/logger';

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

    // Check if watch needs renewal before syncing
    await this.ensureWatchIsActive(tenantId);

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
   * Process a batch of message IDs in chunks with historyId checkpointing
   * Fetches and saves in chunks of 50 to:
   * - Reduce memory usage
   * - Enable checkpointing after each chunk
   * - Limit blast radius of failures
   */
  private async processMessageIds(
    tenantId: string,
    runId: string,
    messageIds: string[]
  ): Promise<{ processed: number; inserted: number; skipped: number }> {
    const CHUNK_SIZE = 50;

    logger.info(
      { tenantId, runId, messageIdsCount: messageIds.length, chunkSize: CHUNK_SIZE },
      'processMessageIds: Starting to process message IDs in chunks'
    );

    if (messageIds.length === 0) {
      logger.info({ tenantId, runId }, 'processMessageIds: No message IDs to process');
      return { processed: 0, inserted: 0, skipped: 0 };
    }

    // Get integration to get integration ID
    logger.info({ tenantId, runId }, 'processMessageIds: Fetching integration');
    const integration = await this.integrationClient.getByTenantAndSource(tenantId, 'gmail');
    if (!integration) {
      throw new Error(`Gmail integration not found for tenant ${tenantId}`);
    }

    logger.info(
      { tenantId, runId, integrationId: integration.id },
      'processMessageIds: Integration found, processing in chunks'
    );

    let totalProcessed = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    const totalChunks = Math.ceil(messageIds.length / CHUNK_SIZE);

    // Process messageIds in chunks: fetch chunk → save chunk → checkpoint
    for (let i = 0; i < messageIds.length; i += CHUNK_SIZE) {
      const chunkMessageIds = messageIds.slice(i, i + CHUNK_SIZE);
      const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;

      logger.info(
        { tenantId, runId, chunkNumber, totalChunks, chunkSize: chunkMessageIds.length },
        'Fetching chunk from Gmail'
      );

      // Fetch this chunk of messages from Gmail
      const messages = await this.gmailService.batchGetMessages(tenantId, chunkMessageIds);

      if (messages.length === 0) {
        logger.info({ tenantId, runId, chunkNumber }, 'No messages returned for chunk, skipping');
        continue;
      }

      // Sort by historyId to ensure checkpoint is the highest historyId in this chunk
      messages.sort((a, b) => {
        const historyA = parseInt(a.historyId || '0', 10);
        const historyB = parseInt(b.historyId || '0', 10);
        return historyA - historyB;
      });

      // Parse chunk to provider-agnostic format (groups by thread)
      const emailCollections = this.emailParser.parseMessages(messages, 'gmail');

      logger.info(
        { tenantId, runId, chunkNumber, messageCount: messages.length, threadCount: emailCollections.length },
        'Saving chunk to DB'
      );

      // Save chunk to DB via API
      const result = await this.emailClient.bulkInsertWithThreads(
        tenantId,
        integration.id,
        emailCollections,
        runId
      );

      totalProcessed += messages.length;
      totalInserted += result.insertedCount || 0;
      totalSkipped += result.skippedCount || 0;

      // Get historyId from last message in chunk for checkpointing
      const lastMessage = messages[messages.length - 1];
      const checkpointHistoryId = lastMessage.historyId;

      if (checkpointHistoryId) {
        // Update lastRunToken to checkpoint progress
        await this.integrationClient.updateRunState(tenantId, 'gmail', {
          lastRunToken: checkpointHistoryId,
          lastRunAt: new Date(),
        });

        logger.info(
          {
            tenantId,
            runId,
            chunkNumber,
            totalChunks,
            checkpointHistoryId,
            processed: totalProcessed,
            inserted: totalInserted,
            skipped: totalSkipped,
          },
          'Chunk saved and checkpointed'
        );
      }

      // Update run progress
      await this.runClient.update(runId, {
        itemsProcessed: totalProcessed,
        itemsInserted: totalInserted,
        itemsSkipped: totalSkipped,
      });
    }

    logger.info(
      { tenantId, runId, totalProcessed, totalInserted, totalSkipped, totalChunks },
      'All chunks processed successfully'
    );

    return {
      processed: totalProcessed,
      inserted: totalInserted,
      skipped: totalSkipped,
    };
  }

  /**
   * Renew watch for a specific tenant
   * Public method for scheduled watch renewal
   */
  async renewWatch(tenantId: string): Promise<{ historyId: string; watchExpiresAt: Date; watchSetAt: Date }> {
    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topicName) {
      throw new Error('GMAIL_PUBSUB_TOPIC not configured');
    }

    const { historyId, expiration } = await this.gmailService.setupWatch(tenantId, topicName);

    // Parse expiration timestamp (Gmail returns milliseconds since epoch as string)
    const expirationMs = parseInt(expiration, 10);
    const watchExpiresAt = new Date(expirationMs);
    const watchSetAt = new Date();

    // Update watch expiry timestamps in database
    await this.integrationClient.updateWatchExpiry(tenantId, 'gmail', {
      watchSetAt,
      watchExpiresAt,
    });

    return { historyId, watchExpiresAt, watchSetAt };
  }

  /**
   * Ensure Gmail watch is active (renew if expired or about to expire)
   */
  private async ensureWatchIsActive(tenantId: string): Promise<void> {
    const needsRenewal = await this.integrationClient.needsWatchRenewal(tenantId, 'gmail');

    if (!needsRenewal) {
      logger.info({ tenantId }, 'Watch is still active, no renewal needed');
      return;
    }

    logger.info({ tenantId }, 'Watch expired or missing, renewing watch');

    // Get Pub/Sub topic name from environment
    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topicName) {
      logger.warn({ tenantId }, 'GMAIL_PUBSUB_TOPIC not set, skipping watch setup');
      return;
    }

    try {
      const { historyId, expiration } = await this.gmailService.setupWatch(tenantId, topicName);

      // Parse expiration timestamp (Gmail returns milliseconds since epoch as string)
      const expirationMs = parseInt(expiration, 10);
      const watchExpiresAt = new Date(expirationMs);
      const watchSetAt = new Date();

      // Update watch expiry timestamps in database
      await this.integrationClient.updateWatchExpiry(tenantId, 'gmail', {
        watchSetAt,
        watchExpiresAt,
      });

      logger.info(
        {
          tenantId,
          historyId,
          watchSetAt,
          watchExpiresAt,
          daysUntilExpiry: Math.ceil((watchExpiresAt.getTime() - watchSetAt.getTime()) / (1000 * 60 * 60 * 24)),
        },
        'Watch renewed successfully'
      );
    } catch (error: any) {
      logger.error(
        {
          tenantId,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        },
        'Failed to renew watch - sync will continue but may miss emails'
      );
      // Don't throw - allow sync to continue even if watch renewal fails
    }
  }
}
