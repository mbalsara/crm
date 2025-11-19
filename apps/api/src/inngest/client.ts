import { Inngest } from 'inngest';
import { createAnalyzeEmailFunction } from './functions';

/**
 * Inngest client for durable event processing
 * Handles email analysis and other async operations
 */
export const inngest = new Inngest({
  id: 'crm-api',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

/**
 * All Inngest functions for this service
 * Exported for registration with Inngest
 */
export const inngestFunctions = [createAnalyzeEmailFunction(inngest)];
