import type { Email } from '@crm/shared';
import { logger } from '../utils/logger';
import type { ThreadContext } from './types';

/**
 * Thread context builder
 * Formats thread context from provided emails (stateless - no database connection)
 * API service should fetch thread emails and pass them here
 */
export class ThreadContextBuilder {
  /**
   * Build thread context from Email objects
   * API service should fetch thread emails and pass them here
   */
  buildThreadContextFromEmails(
    emails: Email[],
    currentEmailId?: string
  ): ThreadContext {
    try {
      // Sort by received date
      const sortedEmails = [...emails].sort((a, b) => {
        const dateA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
        const dateB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
        return dateA - dateB;
      });

      const contextParts: string[] = [];
      contextParts.push(`Thread History (${sortedEmails.length} messages):\n`);

      for (const email of sortedEmails) {
        const isCurrent = email.messageId === currentEmailId;
        const marker = isCurrent ? '[CURRENT]' : '';
        
        contextParts.push(`${marker} From: ${email.from.name || email.from.email} (${email.from.email})`);
        contextParts.push(`Subject: ${email.subject}`);
        if (email.receivedAt) {
          contextParts.push(`Date: ${new Date(email.receivedAt).toISOString()}`);
        }
        
        if (email.body) {
          const bodyPreview = email.body.length > 500 
            ? email.body.substring(0, 500) + '...'
            : email.body;
          contextParts.push(`Body: ${bodyPreview}`);
        }
        
        contextParts.push('---');
      }

      return {
        threadContext: contextParts.join('\n'),
      };
    } catch (error: any) {
      logger.error(
        { error: error.message, emailCount: emails.length },
        'Failed to build thread context from emails'
      );
      return {};
    }
  }
}
