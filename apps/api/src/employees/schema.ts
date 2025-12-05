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
 * Employees - Core employee entity
 */
export const employees = pgTable(
  'employees',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),

    // Employee information
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
    tenantEmailUnique: uniqueIndex('uniq_employees_tenant_email').on(
      table.tenantId,
      table.email
    ),
    tenantIdx: index('idx_employees_tenant').on(table.tenantId),
    tenantStatusIdx: index('idx_employees_tenant_status').on(
      table.tenantId,
      table.rowStatus
    ),
  })
);

/**
 * Employee Managers - Direct manager relationships (source of truth)
 *
 * One employee can have multiple managers (matrix organization).
 * Changes trigger async rebuild of employee_accessible_companies.
 */
export const employeeManagers = pgTable(
  'employee_managers',
  {
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    managerId: uuid('manager_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.employeeId, table.managerId] }),
    managerIdx: index('idx_employee_managers_manager').on(table.managerId),
    employeeIdx: index('idx_employee_managers_employee').on(table.employeeId),
    noSelfManager: check('chk_no_self_manager', sql`employee_id != manager_id`),
  })
);

/**
 * Employee Companies - Direct company assignments (source of truth)
 *
 * An employee can be assigned to many companies (50-100+).
 * Changes trigger async rebuild of employee_accessible_companies.
 */
export const employeeCompanies = pgTable(
  'employee_companies',
  {
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.employeeId, table.companyId] }),
    companyIdx: index('idx_employee_companies_company').on(table.companyId),
    employeeIdx: index('idx_employee_companies_employee').on(table.employeeId),
  })
);

/**
 * Employee Accessible Companies - Denormalized access control table
 *
 * Contains ALL companies an employee can access (their own + all descendants').
 * Rebuilt asynchronously via Inngest with 5-minute debounce per tenant.
 *
 * This enables O(1) access control queries instead of recursive hierarchy traversal.
 */
export const employeeAccessibleCompanies = pgTable(
  'employee_accessible_companies',
  {
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    rebuiltAt: timestamp('rebuilt_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.employeeId, table.companyId] }),
    companyIdx: index('idx_eac_company').on(table.companyId),
    employeeIdx: index('idx_eac_employee').on(table.employeeId),
  })
);

// =============================================================================
// Type Exports
// =============================================================================

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

export type EmployeeManager = typeof employeeManagers.$inferSelect;
export type NewEmployeeManager = typeof employeeManagers.$inferInsert;

export type EmployeeCompany = typeof employeeCompanies.$inferSelect;
export type NewEmployeeCompany = typeof employeeCompanies.$inferInsert;

export type EmployeeAccessibleCompany = typeof employeeAccessibleCompanies.$inferSelect;
