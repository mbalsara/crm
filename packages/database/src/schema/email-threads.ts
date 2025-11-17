import { pgTable, text, timestamp, uuid, integer, jsonb, varchar, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { tenants } from './tenants';
import { integrations } from './integrations';

export const emailThreads = pgTable('email_threads', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),

  // Provider info (provider can be derived from integration_id via integrations table)
  integrationId: uuid('integration_id').notNull().references(() => integrations.id),
  providerThreadId: varchar('provider_thread_id', { length: 500 }).notNull(), // provider's thread identifier

  // Thread metadata
  subject: text('subject').notNull(),

  // Timestamps
  firstMessageAt: timestamp('first_message_at').notNull(),
  lastMessageAt: timestamp('last_message_at').notNull(),
  messageCount: integer('message_count').notNull().default(0),

  // Provider-specific data
  metadata: jsonb('metadata').$type<Record<string, any>>(),

  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantLastMessageIdx: index('idx_threads_tenant_last_message').on(table.tenantId, table.lastMessageAt),
  integrationThreadIdx: index('idx_threads_integration_thread').on(table.integrationId, table.providerThreadId),
  integrationIdx: index('idx_threads_integration').on(table.integrationId),
  tenantIntegrationThreadUnique: uniqueIndex('uniq_thread_tenant_integration').on(
    table.tenantId,
    table.integrationId,
    table.providerThreadId
  ),
}));

export type EmailThread = typeof emailThreads.$inferSelect;
export type NewEmailThread = typeof emailThreads.$inferInsert;
