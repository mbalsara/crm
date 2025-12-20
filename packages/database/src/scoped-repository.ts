import { SQL, sql, eq, and } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Database } from './db';
import { isAdmin, type RequestHeader } from '@crm/shared';

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
 * Admin users bypass customer access filters but NEVER bypass tenant isolation.
 */
export abstract class ScopedRepository {
  constructor(protected db: Database) {}

  /**
   * Returns SQL condition for customer access control.
   * Use this in WHERE clauses to filter by accessible customers.
   * Admins bypass this filter and see all customers in tenant.
   */
  protected customerAccessFilter(
    customerIdColumn: PgColumn,
    header: RequestHeader
  ): SQL {
    if (isAdmin(header.permissions)) {
      return sql`true`;
    }

    return sql`${customerIdColumn} IN (
      SELECT uac.customer_id
      FROM user_accessible_customers uac
      WHERE uac.user_id = ${header.userId}
    )`;
  }

  /**
   * Returns SQL condition for tenant isolation.
   * MUST be included in every query - NEVER bypassed, even for admins.
   */
  protected tenantFilter(
    tenantIdColumn: PgColumn,
    header: RequestHeader
  ): SQL {
    return eq(tenantIdColumn, header.tenantId);
  }

  /**
   * Combines tenant + customer access filters.
   * For admin users, only applies tenant filter.
   */
  protected accessFilter(
    tenantIdColumn: PgColumn,
    customerIdColumn: PgColumn,
    header: RequestHeader
  ): SQL {
    if (isAdmin(header.permissions)) {
      return this.tenantFilter(tenantIdColumn, header);
    }

    return and(
      this.tenantFilter(tenantIdColumn, header),
      this.customerAccessFilter(customerIdColumn, header)
    )!;
  }

  /**
   * Check if user has access to a specific customer.
   * Admins always have access within their tenant.
   */
  protected async hasCustomerAccess(
    header: RequestHeader,
    customerId: string
  ): Promise<boolean> {
    if (isAdmin(header.permissions)) {
      return true;
    }

    const result = await this.db.execute(sql`
      SELECT 1 FROM user_accessible_customers
      WHERE user_id = ${header.userId} AND customer_id = ${customerId}
      LIMIT 1
    `);
    return result.length > 0;
  }
}
