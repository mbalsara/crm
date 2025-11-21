/**
 * Maximum number of emails to include in thread context
 * Limits token usage and memory for large threads
 *
 * Phase 1: Include only recent emails (default: 5)
 * Phase 2: LLM will query for additional thread context via tools when needed
 */
const MAX_THREAD_CONTEXT_EMAILS = 5;

/**
 * Maximum body length per email in thread context
 */
const MAX_BODY_PREVIEW_LENGTH = 300;

/**
 * Build thread context string for analyses that require it
 * Limits context size to reduce token usage and prevent memory issues with large threads
 *
 * Phase 1: Includes limited recent emails (MAX_THREAD_CONTEXT_EMAILS)
 * Phase 2: LLM will query for additional thread context via tools when needed
 *
 * Performance optimizations:
 * 1. Limits to MAX_THREAD_CONTEXT_EMAILS most recent emails
 * 2. Truncates body previews to MAX_BODY_PREVIEW_LENGTH
 * 3. Prioritizes emails around the current email
 */
export function buildThreadContext(threadEmails: any[], currentMessageId: string): { threadContext: string } {
  if (!threadEmails || threadEmails.length === 0) {
    return { threadContext: 'No thread history available' };
  }

  // Sort by received date
  const sortedEmails = [...threadEmails].sort((a, b) => {
    const dateA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
    const dateB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
    return dateA - dateB;
  });

  // Select emails to include (limit to MAX_THREAD_CONTEXT_EMAILS)
  // Strategy: Include the most recent emails (including current email)
  // This prioritizes recent context which is most relevant for analysis
  // Phase 2: LLM can query for older thread context via tools if needed
  let emailsToInclude: any[];

  if (sortedEmails.length <= MAX_THREAD_CONTEXT_EMAILS) {
    // Thread is small enough - include all emails
    emailsToInclude = sortedEmails;
  } else {
    // Thread is large - include the most recent MAX_THREAD_CONTEXT_EMAILS emails
    // This ensures we always include the current email (which is typically the most recent)
    emailsToInclude = sortedEmails.slice(-MAX_THREAD_CONTEXT_EMAILS);
  }

  const contextParts: string[] = [];
  if (sortedEmails.length > emailsToInclude.length) {
    contextParts.push(
      `Thread History (showing ${emailsToInclude.length} of ${sortedEmails.length} messages, most recent):\n`
    );
    contextParts.push(
      `Note: Additional thread context can be retrieved via tools if needed (Phase 2).\n`
    );
  } else {
    contextParts.push(`Thread History (${sortedEmails.length} messages):\n`);
  }

  for (const dbEmail of emailsToInclude) {
    const isCurrent = dbEmail.messageId === currentMessageId;
    const marker = isCurrent ? '[CURRENT]' : '';

    contextParts.push(`${marker} From: ${dbEmail.fromName || dbEmail.fromEmail} (${dbEmail.fromEmail})`);
    contextParts.push(`Subject: ${dbEmail.subject}`);
    if (dbEmail.receivedAt) {
      contextParts.push(`Date: ${new Date(dbEmail.receivedAt).toISOString()}`);
    }

    if (dbEmail.body) {
      const bodyPreview = dbEmail.body.length > MAX_BODY_PREVIEW_LENGTH
        ? dbEmail.body.substring(0, MAX_BODY_PREVIEW_LENGTH) + '...'
        : dbEmail.body;
      contextParts.push(`Body: ${bodyPreview}`);
    }

    contextParts.push('---');
  }

  return {
    threadContext: contextParts.join('\n'),
  };
}
