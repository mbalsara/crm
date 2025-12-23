import { pgTable, uuid, varchar, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { emails } from './schema';
import { customers } from '../customers/schema';
import { tenants } from '../tenants/schema';

/**
 * Participant type enum
 */
export const participantTypeEnum = pgEnum('participant_type', ['user', 'contact']);

/**
 * Email direction enum
 */
export const emailDirectionEnum = pgEnum('email_direction', ['from', 'to', 'cc', 'bcc']);

/**
 * Email Participants - Links emails to users/contacts with customer context
 *
 * This table enables:
 * 1. Efficient access control via customer_id join
 * 2. Multi-customer email support (email to multiple domains)
 * 3. Unified participant tracking (users and contacts)
 * 4. Direction tracking (from/to/cc/bcc)
 *
 * Access control query pattern:
 * ```sql
 * SELECT DISTINCT e.*
 * FROM emails e
 * INNER JOIN email_participants ep ON e.id = ep.email_id
 * INNER JOIN user_accessible_customers uac ON ep.customer_id = uac.customer_id
 * WHERE uac.user_id = :currentUserId AND e.tenant_id = :tenantId
 * ```
 */
export const emailParticipants = pgTable(
  'email_participants',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    // Tenant isolation
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),

    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),

    // Participant (polymorphic - can be user or contact)
    // Note: Can't use FK due to polymorphism, validated at application level
    participantType: participantTypeEnum('participant_type').notNull(),
    participantId: uuid('participant_id').notNull(),

    // Email address (denormalized for display/search)
    email: varchar('email', { length: 500 }).notNull(),
    name: varchar('name', { length: 500 }),

    // Direction in the email
    direction: emailDirectionEnum('direction').notNull(),

    // Customer link for access control (NULL for internal users without customer context)
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Tenant isolation
    index('idx_ep_tenant').on(table.tenantId),

    // Primary lookup: find participants for an email
    index('idx_ep_email').on(table.emailId),

    // Access control: find all emails for accessible customers (within tenant)
    index('idx_ep_tenant_customer').on(table.tenantId, table.customerId),

    // Participant lookup: find all emails for a user or contact
    index('idx_ep_participant').on(table.participantType, table.participantId),

    // Direction filtering: find all 'from' participants for an email
    index('idx_ep_email_direction').on(table.emailId, table.direction),

    // Email address lookup (for finding participant by email within tenant)
    index('idx_ep_tenant_email_address').on(table.tenantId, table.email),
  ]
);

export type EmailParticipant = typeof emailParticipants.$inferSelect;
export type NewEmailParticipant = typeof emailParticipants.$inferInsert;
