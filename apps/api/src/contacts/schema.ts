import { pgTable, text, timestamp, uuid, varchar, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { tenants } from '../tenants/schema';
import { companies } from '../companies/schema';

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').references(() => companies.id),
    
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
    companyIdx: index('idx_contacts_company').on(table.companyId),
    tenantCompanyIdx: index('idx_contacts_tenant_company').on(table.tenantId, table.companyId),
    tenantEmailUnique: uniqueIndex('uniq_contacts_tenant_email').on(table.tenantId, table.email),
  })
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
