import { pgTable, text, timestamp, uuid, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const integrationSourceEnum = pgEnum('integration_source', [
  'gmail',
  'outlook',
  'slack',
  'other',
]);

export const integrationAuthTypeEnum = pgEnum('integration_auth_type', [
  'oauth',
  'service_account',
  'api_key',
]);

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid('tenant_id').notNull(),

  source: integrationSourceEnum('source').notNull(),
  authType: integrationAuthTypeEnum('auth_type').notNull(),

  // Encrypted credentials (JSON)
  keys: text('keys').notNull(),

  // OAuth specific (if auth_type = 'oauth')
  tokenExpiresAt: timestamp('token_expires_at'),

  // Run state (integration-specific)
  lastRunToken: text('last_run_token'), // Gmail historyId, Outlook deltaToken, etc.
  lastRunAt: timestamp('last_run_at'),

  // Metadata
  isActive: boolean('is_active').default(true).notNull(),
  lastUsedAt: timestamp('last_used_at'),

  // Audit fields
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type IntegrationSource = 'gmail' | 'outlook' | 'slack' | 'other';
