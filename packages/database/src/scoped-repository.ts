import { SQL, sql, eq, and } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Database } from './db';

/**
 * Access context for scoped queries
 */
export interface AccessContext {
  tenantId: string;
  userId: string; // User ID (used for access control)
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
 */
export abstract class ScopedRepository {
  constructor(protected db: Database) {}

  /**
   * Returns SQL condition for customer access control.
   * Use this in WHERE clauses to filter by accessible customers.
   *
   * Uses user_accessible_customers table for O(1) lookup per customer.
   * This table is pre-computed and contains all customers the user can access.
   */
  protected customerAccessFilter(
    customerIdColumn: PgColumn,
    context: AccessContext
  ): SQL {
    return sql`${customerIdColumn} IN (
      SELECT uac.customer_id
      FROM user_accessible_customers uac
      WHERE uac.user_id = ${context.userId}
    )`;
  }

  /**
   * Returns SQL condition for tenant isolation.
   * MUST be included in every query.
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
   */
  protected accessFilter(
    tenantIdColumn: PgColumn,
    customerIdColumn: PgColumn,
    context: AccessContext
  ): SQL {
    return and(
      this.tenantFilter(tenantIdColumn, context),
      this.customerAccessFilter(customerIdColumn, context)
    )!;
  }

  /**
   * Check if context has access to a specific customer.
   * Uses user_accessible_customers table for O(1) lookup.
   */
  protected async hasCustomerAccess(
    context: AccessContext,
    customerId: string
  ): Promise<boolean> {
    const result = await this.db.execute(sql`
      SELECT 1 FROM user_accessible_customers
      WHERE user_id = ${context.userId} AND customer_id = ${customerId}
      LIMIT 1
    `);
    return result.length > 0;
  }
}
