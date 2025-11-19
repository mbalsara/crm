import { Inngest } from 'inngest';

/**
 * Inngest client for durable event processing
 * Handles email analysis and other async operations
 */
export const inngest = new Inngest({
  id: 'crm-api',
  eventKey: process.env.INNGEST_EVENT_KEY,
});
