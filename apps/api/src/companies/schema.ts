import { pgTable, text, timestamp, uuid, varchar, jsonb } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { tenants } from '../tenants/schema';
import { companyDomains } from './company-domains-schema';

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    
    // Company information
    name: text('name'), // Extracted from emails or manual entry
    website: text('website'),
    industry: varchar('industry', { length: 100 }),
    
    // Metadata
    metadata: jsonb('metadata').$type<Record<string, any>>(),
    
    // Tracking
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  }
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

// Re-export company domains schema for repository use
export { companyDomains };
export type { CompanyDomain, NewCompanyDomain } from './company-domains-schema';
