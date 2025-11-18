import { pgTable, text, timestamp, uuid, varchar, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { tenants } from '../tenants/schema';
import { companies } from './schema';

/**
 * Company Domains table
 * Supports multiple domains per company (for future company merging)
 * Each domain is unique across all companies (within a tenant)
 */
export const companyDomains = pgTable(
  'company_domains',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    
    // Domain stored in lowercase for consistency
    domain: varchar('domain', { length: 255 }).notNull(),
    
    // Metadata
    verified: boolean('verified').notNull().default(false), // Whether domain is verified
    
    // Tracking
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    // Each domain must be unique per tenant
    tenantDomainUnique: uniqueIndex('uniq_company_domains_tenant_domain').on(table.tenantId, table.domain),
    companyIdIdx: index('idx_company_domains_company_id').on(table.companyId),
    tenantDomainIdx: index('idx_company_domains_tenant_domain').on(table.tenantId, table.domain),
  })
);

export type CompanyDomain = typeof companyDomains.$inferSelect;
export type NewCompanyDomain = typeof companyDomains.$inferInsert;
