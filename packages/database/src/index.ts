// Database package only exports db instance creation function
// Schemas and repositories are API-specific and live in API modules
// This keeps database package independent (no dependency on API)
export * from './db';
export type { Database } from './db';
