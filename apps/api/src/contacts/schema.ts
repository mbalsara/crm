import { pgTable, text, timestamp, uuid, varchar, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { tenants } from '../tenants/schema';
import { customers } from '../customers/schema';

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    customerId: uuid('company_id').references(() => customers.id), // DB column stays company_id for backwards compatibility
    
    // Contact information
    email: varchar('email', { length: 500 }).notNull(),
    name: text('name'),
    
    // Extracted from signature
    title: varchar('title', { length: 200 }),
    phone: varchar('phone', { length: 50 }),
    
    // Tracking
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    tenantEmailIdx: index('idx_contacts_tenant_email').on(table.tenantId, table.email),
    customerIdx: index('idx_contacts_company').on(table.customerId), // Index name unchanged for backwards compatibility
    tenantCustomerIdx: index('idx_contacts_tenant_company').on(table.tenantId, table.customerId), // Index name unchanged
    tenantEmailUnique: uniqueIndex('uniq_contacts_tenant_email').on(table.tenantId, table.email),
  })
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
