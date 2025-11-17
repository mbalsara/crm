import { pgTable, text, timestamp, uuid, jsonb, varchar, decimal, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { tenants } from './tenants';
import { emailThreads } from './email-threads';
import { integrations } from './integrations';

export const emails = pgTable('emails', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  threadId: uuid('thread_id').notNull().references(() => emailThreads.id, { onDelete: 'cascade' }),

  // Provider identifiers
  integrationId: uuid('integration_id').references(() => integrations.id),
  provider: varchar('provider', { length: 50 }).notNull(), // 'gmail', 'outlook', etc.
  messageId: varchar('message_id', { length: 500 }).notNull(), // provider's unique message ID

  // Email content
  subject: text('subject').notNull(),
  body: text('body'),

  // Sender
  fromEmail: varchar('from_email', { length: 500 }).notNull(),
  fromName: varchar('from_name', { length: 500 }),

  // Recipients (arrays of objects: [{email, name}])
  tos: jsonb('tos').$type<Array<{ email: string; name?: string }>>(),
  ccs: jsonb('ccs').$type<Array<{ email: string; name?: string }>>(),
  bccs: jsonb('bccs').$type<Array<{ email: string; name?: string }>>(),

  // Metadata
  priority: varchar('priority', { length: 20 }).notNull().default('normal'),
  labels: text('labels').array(),
  receivedAt: timestamp('received_at').notNull(),

  // Provider-specific data (store Gmail labels, Outlook categories, etc.)
  metadata: jsonb('metadata').$type<Record<string, any>>(),

  // Analysis (computed async)
  sentiment: varchar('sentiment', { length: 20 }), // 'positive', 'negative', 'neutral'
  sentimentScore: decimal('sentiment_score', { precision: 3, scale: 2 }), // -1.0 to 1.0

  // Tracking
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantReceivedIdx: index('idx_emails_tenant_received').on(table.tenantId, table.receivedAt),
  threadIdx: index('idx_emails_thread').on(table.threadId, table.receivedAt),
  fromIdx: index('idx_emails_from').on(table.tenantId, table.fromEmail),
  providerMessageIdx: index('idx_emails_provider_message').on(table.provider, table.messageId),
  integrationIdx: index('idx_emails_integration').on(table.integrationId),
  tenantProviderMessageUnique: uniqueIndex('uniq_emails_tenant_provider_message').on(
    table.tenantId,
    table.provider,
    table.messageId
  ),
}));

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
