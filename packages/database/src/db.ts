import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
// Import schemas from API modules (schemas are co-located with their related code)
import { users } from '../../apps/api/src/users/schema';
import { tenants } from '../../apps/api/src/tenants/schema';
import { integrations } from '../../apps/api/src/integrations/schema';
import { emailThreads, emails } from '../../apps/api/src/emails/schema';
import { runs } from '../../apps/api/src/runs/schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/crm';

const client = postgres(connectionString);
export const db = drizzle(client, {
  schema: {
    users,
    tenants,
    integrations,
    emailThreads,
    emails,
    runs,
  },
});

export type Database = typeof db;
