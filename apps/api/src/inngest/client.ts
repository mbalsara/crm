import { Inngest } from 'inngest';
import { createAnalyzeEmailFunction } from './functions';

/**
 * Inngest client for durable event processing
 * Handles email analysis and other async operations
 *
 * Required environment variable:
 * - INNGEST_SIGNING_KEY: Signing key from Inngest dashboard for webhook verification
 *   (Found in Inngest dashboard → Settings → Keys)
 */
export const inngest = new Inngest({
  id: 'crm-api',
  // Signing key is used to verify webhook requests from Inngest
  // Set via INNGEST_SIGNING_KEY environment variable (recommended)
});

/**
 * All Inngest functions for this service
 * Exported for registration with Inngest
 */
export const inngestFunctions = [createAnalyzeEmailFunction(inngest)];
