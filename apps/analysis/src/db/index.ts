import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { logger } from '../utils/logger';

let client: ReturnType<typeof postgres> | null = null;
let db: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Get database connection (lazy initialization)
 * Uses postgres-js driver (same as crm-api)
 */
export function getDb() {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    client = postgres(databaseUrl);
    db = drizzle(client, { schema });
    logger.info('Database connection initialized');
  }
  return db;
}

export { schema };
