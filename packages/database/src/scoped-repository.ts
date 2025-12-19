import { SQL, sql, eq, and } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Database } from './db';

/**
 * Access context for scoped queries
 *
 * Extended with RBAC support:
 * - permissions: Array of permission integers from user's role
 * - isAdmin: If true, bypasses customer-level access filters (still respects tenant isolation)
 */
export interface AccessContext {
  tenantId: string;
  userId: string;
  permissions?: number[];
  isAdmin?: boolean;
}

/**
 * Base repository class for repositories that need access control
 *
 * Provides helper methods for tenant isolation and customer access control.
 * All repositories that query customer-scoped data should extend this class.
 *
 * Access control uses the `user_accessible_customers` denormalized table which
 * contains all customers a user can access (their direct assignments + all
 * customers accessible via their reporting hierarchy). This table is rebuilt
 * asynchronously via Inngest when user_managers or user_customers changes.
 *
 * Admin users (context.isAdmin = true) bypass customer access filters but
 * NEVER bypass tenant isolation.
 */
export abstract class ScopedRepository {
  constructor(protected db: Database) {}

  /**
   * Returns SQL condition for customer access control.
   * Use this in WHERE clauses to filter by accessible customers.
   *
   * BYPASSED if context.isAdmin is true - admins see all customers in tenant.
   *
   * Uses user_accessible_customers table for O(1) lookup per customer.
   * This table is pre-computed and contains all customers the user can access.
   */
  protected customerAccessFilter(
    customerIdColumn: PgColumn,
    context: AccessContext
  ): SQL {
    // Admins see all customers within their tenant
    if (context.isAdmin) {
      return sql`true`;
    }

    return sql`${customerIdColumn} IN (
      SELECT uac.customer_id
      FROM user_accessible_customers uac
      WHERE uac.user_id = ${context.userId}
    )`;
  }

  /**
   * Returns SQL condition for tenant isolation.
   * MUST be included in every query - NEVER bypassed, even for admins.
   */
  protected tenantFilter(
    tenantIdColumn: PgColumn,
    context: AccessContext
  ): SQL {
    return eq(tenantIdColumn, context.tenantId);
  }

  /**
   * Combines tenant + customer access filters.
   * Standard filter for most queries.
   *
   * For admin users, only applies tenant filter (customer filter bypassed).
   */
  protected accessFilter(
    tenantIdColumn: PgColumn,
    customerIdColumn: PgColumn,
    context: AccessContext
  ): SQL {
    // Admins only need tenant filter, they see all customers
    if (context.isAdmin) {
      return this.tenantFilter(tenantIdColumn, context);
    }

    return and(
      this.tenantFilter(tenantIdColumn, context),
      this.customerAccessFilter(customerIdColumn, context)
    )!;
  }

  /**
   * Check if context has access to a specific customer.
   * Admins always have access within their tenant.
   * Uses user_accessible_customers table for O(1) lookup.
   */
  protected async hasCustomerAccess(
    context: AccessContext,
    customerId: string
  ): Promise<boolean> {
    // Admins have access to all customers in their tenant
    if (context.isAdmin) {
      return true;
    }

    const result = await this.db.execute(sql`
      SELECT 1 FROM user_accessible_customers
      WHERE user_id = ${context.userId} AND customer_id = ${customerId}
      LIMIT 1
    `);
    return result.length > 0;
  }
}
