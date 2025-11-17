import type { Email, EmailThread } from '@crm/shared';
import type { NewEmail, NewEmailThread } from './schema';

/**
 * Convert email thread to database insert type
 */
export function threadToDb(
  thread: EmailThread,
  tenantId: string,
  integrationId: string
): NewEmailThread {
  return {
    tenantId,
    integrationId, // Required - provider can be derived from integration
    providerThreadId: thread.threadId,
    subject: thread.subject,
    firstMessageAt: thread.firstMessageAt,
    lastMessageAt: thread.lastMessageAt,
    messageCount: thread.messageCount,
    metadata: thread.metadata,
  };
}

/**
 * Convert email to database insert type
 */
export function emailToDb(
  email: Email,
  tenantId: string,
  threadId: string,
  integrationId?: string
): NewEmail {
  return {
    tenantId,
    threadId,
    integrationId,
    provider: email.provider,
    messageId: email.messageId,
    subject: email.subject,
    body: email.body,
    fromEmail: email.from.email,
    fromName: email.from.name,
    tos: email.tos,
    ccs: email.ccs,
    bccs: email.bccs,
    priority: email.priority || 'normal',
    labels: email.labels,
    receivedAt: email.receivedAt,
    metadata: email.metadata,
  };
}
