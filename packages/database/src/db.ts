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
    // Use console.error to ensure it shows up even if stdout is redirected
    console.error('\n🔵 [Drizzle SQL]', query);
    if (params && params.length > 0) {
      console.error('🔵 [Drizzle Params]', JSON.stringify(params, null, 2));
    }
    console.error(''); // Empty line for readability
  },
};

export function createDatabase<T extends Record<string, unknown>>(schema: T): PostgresJsDatabase<T> {
  // Enable logging if DRIZZLE_LOG is 'true' or in development mode (default to true for dev)
  const nodeEnv = process.env.NODE_ENV || 'development';
  const enableLogging = process.env.DRIZZLE_LOG === 'true' || 
                        (process.env.DRIZZLE_LOG !== 'false' && nodeEnv === 'development');
  
  // Always log to stderr so it shows up even if stdout is redirected
  console.error(`\n[Drizzle] ========================================`);
  console.error(`[Drizzle] Initializing database...`);
  console.error(`[Drizzle] NODE_ENV: ${nodeEnv}`);
  console.error(`[Drizzle] DRIZZLE_LOG: ${process.env.DRIZZLE_LOG || 'not set'}`);
  console.error(`[Drizzle] Logging enabled: ${enableLogging}`);
  console.error(`[Drizzle] ========================================\n`);
  
  if (dbInstance) {
    console.error(`[Drizzle] ⚠️  Database instance already exists - recreating with logging=${enableLogging}`);
    dbInstance = null; // Force recreation to enable/disable logging
  }
  
  dbInstance = drizzle(client, { 
    schema,
    logger: enableLogging ? drizzleLogger : false
  });
  
  if (enableLogging) {
    console.error(`[Drizzle] ✅ SQL logging ENABLED - queries will appear below\n`);
  } else {
    console.error(`[Drizzle] ❌ SQL logging DISABLED\n`);
  }
  
  return dbInstance as PostgresJsDatabase<T>;
}

export function getDatabase(): PostgresJsDatabase<Record<string, unknown>> {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call createDatabase() first with schemas.');
  }
  return dbInstance;
}

export type Database = PostgresJsDatabase<Record<string, unknown>>;
