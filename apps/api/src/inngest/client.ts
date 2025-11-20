import { Inngest } from 'inngest';
import { createAnalyzeEmailFunction } from './functions';

/**
 * Inngest client for durable event processing
 * Handles email analysis and other async operations
 *
 * Required environment variable:
 * - INNGEST_SIGNING_KEY: Signing key from Inngest dashboard
 *   Used for BOTH sending events AND verifying webhooks
 *   (Found in Inngest dashboard → Settings → Keys)
 */
export const inngest = new Inngest({
  id: 'crm-api',
  eventKey: process.env.INNGEST_SIGNING_KEY,
});

/**
 * All Inngest functions for this service
 * Exported for registration with Inngest
 */
export const inngestFunctions = [createAnalyzeEmailFunction(inngest)];
