import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  smallint,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { tenants } from '../tenants/schema';
import { companies } from '../companies/schema';

/**
 * Row status enum values
 */
export const RowStatus = {
  ACTIVE: 0,
  INACTIVE: 1,
  ARCHIVED: 2,
} as const;

export type RowStatusType = (typeof RowStatus)[keyof typeof RowStatus];

/**
 * Users - Core user entity (merged from employees)
 * Users are employees - same entity
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),

    // User information
    firstName: varchar('first_name', { length: 60 }).notNull(),
    lastName: varchar('last_name', { length: 60 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),

    // Status: 0 = active, 1 = inactive, 2 = archived
    rowStatus: smallint('row_status').notNull().default(0),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantEmailUnique: uniqueIndex('uniq_users_tenant_email').on(
      table.tenantId,
      table.email
    ),
    tenantIdx: index('idx_users_tenant').on(table.tenantId),
    tenantStatusIdx: index('idx_users_tenant_status').on(
      table.tenantId,
      table.rowStatus
    ),
  })
);

/**
 * User Managers - Direct manager relationships (source of truth)
 *
 * One user can have multiple managers (matrix organization).
 * Changes trigger async rebuild of user_accessible_companies.
 */
export const userManagers = pgTable(
  'user_managers',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    managerId: uuid('manager_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.managerId] }),
    managerIdx: index('idx_user_managers_manager').on(table.managerId),
    userIdx: index('idx_user_managers_user').on(table.userId),
    noSelfManager: check('chk_no_self_manager', sql`user_id != manager_id`),
  })
);

/**
 * User Companies - Direct company assignments (source of truth)
 *
 * A user can be assigned to many companies (50-100+).
 * Changes trigger async rebuild of user_accessible_companies.
 */
export const userCompanies = pgTable(
  'user_companies',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.companyId] }),
    companyIdx: index('idx_user_companies_company').on(table.companyId),
    userIdx: index('idx_user_companies_user').on(table.userId),
  })
);

/**
 * User Accessible Companies - Denormalized access control table
 *
 * Contains ALL companies a user can access (their own + all descendants').
 * Rebuilt asynchronously via Inngest with 5-minute debounce per tenant.
 *
 * This enables O(1) access control queries instead of recursive hierarchy traversal.
 */
export const userAccessibleCompanies = pgTable(
  'user_accessible_companies',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    rebuiltAt: timestamp('rebuilt_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.companyId] }),
    companyIdx: index('idx_uac_company').on(table.companyId),
    userIdx: index('idx_uac_user').on(table.userId),
  })
);

// =============================================================================
// Type Exports
// =============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type UserManager = typeof userManagers.$inferSelect;
export type NewUserManager = typeof userManagers.$inferInsert;

export type UserCompany = typeof userCompanies.$inferSelect;
export type NewUserCompany = typeof userCompanies.$inferInsert;

export type UserAccessibleCompany = typeof userAccessibleCompanies.$inferSelect;
