import { pgTable, text, timestamp, uuid, varchar, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { tenants } from '../tenants/schema';

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    
    // Domain information
    domain: varchar('domain', { length: 255 }).notNull(), // e.g., "acme.com" (top-level only)
    
    // Company information
    name: text('name'), // Extracted from emails or manual entry
    website: text('website'),
    industry: varchar('industry', { length: 100 }),
    
    // Metadata
    metadata: jsonb('metadata').$type<Record<string, any>>(),
    
    // Tracking
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    tenantDomainIdx: index('idx_companies_tenant_domain').on(table.tenantId, table.domain),
    tenantDomainUnique: uniqueIndex('uniq_companies_tenant_domain').on(table.tenantId, table.domain),
  })
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
