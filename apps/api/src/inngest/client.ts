import { Inngest } from 'inngest';
import { createAnalyzeEmailFunction } from '../emails/inngest/functions';
import { createRebuildAccessibleCompaniesFunction } from '../users/inngest/functions';

/**
 * Inngest client for durable event processing
 * Handles email analysis and other async operations
 *
 * Required environment variables:
 * - INNGEST_EVENT_KEY: Event key for sending/publishing events to Inngest
 * - INNGEST_SIGNING_KEY: Signing key for receiving/verifying webhooks from Inngest
 *   (Both found in Inngest dashboard → Settings → Keys)
 */
export const inngest = new Inngest({
  id: 'crm-api',
  // SDK automatically reads INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY from environment
});

/**
 * All Inngest functions for this service
 * Exported for registration with Inngest
 */
export const inngestFunctions = [
  createAnalyzeEmailFunction(inngest),
  createRebuildAccessibleCompaniesFunction(inngest),
];
