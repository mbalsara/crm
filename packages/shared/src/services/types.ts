import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Transaction type for drizzle-orm
 * Extracted from the transaction callback parameter
 */
export type Transaction<T extends Record<string, unknown> = Record<string, unknown>> = 
  PostgresJsDatabase<T>;

/**
 * Base service interface pattern
 * All services should follow this pattern for consistency
 */
export interface BaseService {
  // Services can optionally implement common methods here
  // Currently left empty to allow flexibility
}
