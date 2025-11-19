import { inngest } from './client';
import { container } from '@crm/shared';
import { EmailService } from '../emails/service';
import { logger } from '../utils/logger';
import type { Email } from '@crm/shared';

/**
 * Inngest function to handle email analysis after insertion
 * This function is durable: it will retry on failures and survive service restarts
 * Uses idempotency key to prevent duplicate processing
 */
export const analyzeEmail = inngest.createFunction(
  {
    id: 'analyze-email',
    name: 'Analyze Email After Insertion',
    retries: 5, // Retry up to 5 times on failure
    idempotency: 'event.data.emailId', // Use emailId as idempotency key - same email won't be analyzed twice
  },
  { event: 'email/inserted' },
  async ({ event, step }) => {
    const { tenantId, emailId, provider, threadId, providerThreadId, email: emailData } = event.data;
    
    logger.info(
      {
        tenantId,
        emailId,
        threadId,
        eventId: event.id,
      },
      'Inngest: Starting email analysis'
    );

    // Step 1: Reconstruct Email object from event data
    const email: Email = await step.run('reconstruct-email', async () => {
      return {
        provider: provider as Email['provider'],
        messageId: emailId,
        threadId: providerThreadId,
        subject: emailData.subject,
        body: emailData.body,
        from: emailData.from,
        tos: emailData.tos || [],
        ccs: emailData.ccs,
        bccs: emailData.bccs,
        priority: emailData.priority || 'normal',
        labels: emailData.labels,
        receivedAt: emailData.receivedAt ? new Date(emailData.receivedAt) : new Date(),
        metadata: emailData.metadata,
      };
    });

    // Step 2: Execute analysis (durable step - will retry on failure)
    // Use step.run for durability - if this fails, Inngest will retry automatically
    await step.run('execute-analysis', async () => {
      // Resolve EmailService from container
      const emailService = container.resolve(EmailService);
      
      // Execute analysis - this is idempotent (safe to retry)
      // Analysis operations check if they've already been done before processing
      await emailService.analyzeEmail(tenantId, email, threadId);
      
      logger.info(
        {
          tenantId,
          emailId,
          threadId,
        },
        'Inngest: Email analysis completed successfully'
      );
    });

    return {
      tenantId,
      emailId,
      threadId,
      success: true,
    };
  }
);

/**
 * Export all Inngest functions for registration
 */
export const inngestFunctions = [analyzeEmail];
