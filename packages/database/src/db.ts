import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/crm';

const client = postgres(connectionString);

// Database instance is created by API with schemas passed in
// This keeps database package independent of API schemas (no circular dependency)
let dbInstance: PostgresJsDatabase<Record<string, unknown>> | null = null;

// Custom logger for Drizzle SQL queries
const drizzleLogger = {
  logQuery: (query: string, params: unknown[]) => {
    console.log('🔵 [Drizzle SQL]', query);
    if (params && params.length > 0) {
      console.log('🔵 [Drizzle Params]', params);
    }
  },
};

export function createDatabase<T extends Record<string, unknown>>(schema: T): PostgresJsDatabase<T> {
  if (dbInstance) {
    return dbInstance as PostgresJsDatabase<T>;
  }
  
  const enableLogging = process.env.DRIZZLE_LOG === 'true' || process.env.NODE_ENV === 'development';
  
  dbInstance = drizzle(client, { 
    schema,
    logger: enableLogging ? drizzleLogger : false
  });
  return dbInstance as PostgresJsDatabase<T>;
}

export function getDatabase(): PostgresJsDatabase<Record<string, unknown>> {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call createDatabase() first with schemas.');
  }
  return dbInstance;
}

export type Database = PostgresJsDatabase<Record<string, unknown>>;
