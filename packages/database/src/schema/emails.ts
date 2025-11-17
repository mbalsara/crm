import { pgTable, text, timestamp, uuid, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const emails = pgTable('emails', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid('tenant_id').notNull(),

  // Gmail identifiers
  gmailMessageId: text('gmail_message_id').notNull(),
  gmailThreadId: text('gmail_thread_id').notNull(),

  // Email metadata
  subject: text('subject'),
  fromEmail: text('from_email').notNull(),
  fromName: text('from_name'),
  tos: jsonb('tos').notNull().$type<Array<{ email: string; name?: string }>>(),
  ccs: jsonb('ccs').default([]).notNull().$type<Array<{ email: string; name?: string }>>(),
  bccs: jsonb('bccs').default([]).notNull().$type<Array<{ email: string; name?: string }>>(),

  // Content - store HTML preferably, fallback to plain text
  body: text('body'),

  // Additional fields
  priority: text('priority'), // 'high', 'normal', 'low'
  labels: jsonb('labels').default([]).notNull().$type<string[]>(),
  receivedAt: timestamp('received_at').notNull(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantMessageIdx: index('idx_emails_tenant_message').on(table.tenantId, table.gmailMessageId),
  tenantReceivedIdx: index('idx_emails_tenant_received').on(table.tenantId, table.receivedAt),
  threadIdx: index('idx_emails_thread').on(table.tenantId, table.gmailThreadId),
  tenantMessageUnique: uniqueIndex('uniq_emails_tenant_message').on(table.tenantId, table.gmailMessageId),
}));

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
