import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { tenants } from '../tenants/schema';

/**
 * Roles - Define permissions for users within a tenant
 *
 * Each tenant has their own set of roles with customizable permissions.
 * System roles (is_system=true) are seeded and cannot be deleted.
 *
 * Permissions are stored as an integer array for flexibility:
 * - Easy to add/remove permissions without code changes
 * - Readable and queryable in SQL
 * - Simple UI with checkboxes
 */
export const roles = pgTable(
  'roles',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),

    // Role information
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),

    // Permissions as integer array (see Permission constants in @crm/shared)
    permissions: integer('permissions').array().notNull().default([]),

    // System roles cannot be deleted
    isSystem: boolean('is_system').notNull().default(false),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('uniq_roles_tenant_name').on(table.tenantId, table.name),
    index('idx_roles_tenant').on(table.tenantId),
  ]
);

// =============================================================================
// Type Exports
// =============================================================================

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
