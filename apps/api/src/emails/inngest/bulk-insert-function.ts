import { Inngest } from 'inngest';
import { container } from '@crm/shared';
import { EmailService } from '../service';
import { RunService } from '../../runs/service';
import { emailCollectionSchema, type EmailCollection } from '@crm/shared';
import { logger } from '../../utils/logger';

/**
 * Inngest function to bulk insert emails with threads
 * Triggered by 'gmail/emails.bulk-insert' event from Gmail service
 * 
 * Uses idempotency key to prevent duplicate processing of the same message batch
 * Retries with exponential backoff on failures
 */
export const createBulkInsertEmailsFunction = (inngest: Inngest) => {
  return inngest.createFunction(
    {
      id: 'bulk-insert-emails',
      name: 'Bulk Insert Emails with Threads',
      retries: 5, // Retry up to 5 times with exponential backoff
      idempotency: 'event.data.runId', // Use runId as idempotency key - same batch won't be inserted twice
    },
    { event: 'gmail/emails.bulk-insert' },
    async ({ event, step }: { event: any; step: any }) => {
      const { tenantId, integrationId, emailCollections, runId } = event.data;

      logger.info(
        {
          tenantId,
          integrationId,
          runId,
          emailCollectionsCount: emailCollections?.length,
          totalEmails: emailCollections?.reduce((sum: number, col: EmailCollection) => sum + col.emails.length, 0),
          eventId: event.id,
        },
        'Inngest: Starting bulk email insert'
      );

      // Validate email collections
      const validationResult = await step.run('validate-collections', async () => {
        if (!emailCollections || !Array.isArray(emailCollections)) {
          throw new Error('emailCollections array is required');
        }

        // Validate each collection
        const validated: EmailCollection[] = [];
        for (let i = 0; i < emailCollections.length; i++) {
          try {
            validated.push(emailCollectionSchema.parse(emailCollections[i]));
          } catch (error: any) {
            throw new Error(`Invalid email collection at index ${i}: ${error.message}`);
          }
        }

        return validated;
      });

      // Bulk insert emails (durable step - will retry on failure)
      const result = await step.run('bulk-insert', async () => {
        const emailService = container.resolve(EmailService);
        
        return await emailService.bulkInsertWithThreads(
          tenantId,
          integrationId,
          validationResult
        );
      });

      // Update run status with results (durable step)
      if (runId) {
        await step.run('update-run-status', async () => {
          const runService = container.resolve(RunService);
          
          await runService.update(runId, {
            status: 'completed',
            itemsProcessed: result.insertedCount + result.skippedCount,
            itemsInserted: result.insertedCount,
            itemsSkipped: result.skippedCount,
            completedAt: new Date(),
          });
        });
      }

      logger.info(
        {
          tenantId,
          integrationId,
          runId,
          insertedCount: result.insertedCount,
          skippedCount: result.skippedCount,
          threadsCreated: result.threadsCreated,
        },
        'Inngest: Bulk email insert completed successfully'
      );

      return {
        tenantId,
        integrationId,
        runId,
        insertedCount: result.insertedCount,
        skippedCount: result.skippedCount,
        threadsCreated: result.threadsCreated,
      };
    }
  );
};
