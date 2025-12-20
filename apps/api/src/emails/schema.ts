import { pgTable, text, timestamp, uuid, integer, jsonb, varchar, decimal, smallint, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { tenants } from '../tenants/schema';
import { integrations } from '../integrations/schema';

/**
 * Email analysis status enum
 * Using SMALLINT for better database performance
 */
export enum EmailAnalysisStatus {
  Pending = 1,
  Processing = 2,
  Completed = 3,
  Failed = 4,
}

// Email threads table
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

// Emails table
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
  isEscalation: boolean('is_escalation').default(false), // true if email is flagged as escalation
  analysisStatus: smallint('analysis_status'), // 1=pending, 2=processing, 3=completed, 4=failed

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

// Re-export analysis schema types
export type { AnalysisType, AnalysisResult, EmailAnalysis, NewEmailAnalysis } from './analysis-schema';
export { emailAnalyses } from './analysis-schema';

// Re-export thread analysis schema types
export type { ThreadAnalysis, NewThreadAnalysis } from './thread-analysis-schema';
export { threadAnalyses } from './thread-analysis-schema';

// Re-export email participants schema types
export type { EmailParticipant, NewEmailParticipant } from './email-participants-schema';
export { emailParticipants, participantTypeEnum, emailDirectionEnum } from './email-participants-schema';

// Re-export Database type
export type { Database } from '@crm/database';
