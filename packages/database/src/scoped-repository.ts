import { SQL, sql, eq, and } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Database } from './db';

/**
 * Access context for scoped queries
 */
export interface AccessContext {
  tenantId: string;
  userId: string; // User ID (same as employee - used for access control)
}

/**
 * Base repository class for repositories that need access control
 * 
 * Provides helper methods for tenant isolation and company access control.
 * All repositories that query company-scoped data should extend this class.
 */
export abstract class ScopedRepository {
  constructor(protected db: Database) {}

  /**
   * Returns SQL condition for company access control.
   * Use this in WHERE clauses to filter by accessible companies.
   * 
   * Uses employee_accessible_companies table (denormalized cache).
   */
  protected companyAccessFilter(
    companyIdColumn: PgColumn,
    context: AccessContext
  ): SQL {
    return sql`${companyIdColumn} IN (
      SELECT uc.company_id
      FROM user_hierarchy uh
      JOIN user_companies uc ON uc.user_id = uh.descendant_id
      WHERE uh.ancestor_id = ${context.userId}
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
   * Combines tenant + company access filters.
   * Standard filter for most queries.
   */
  protected accessFilter(
    tenantIdColumn: PgColumn,
    companyIdColumn: PgColumn,
    context: AccessContext
  ): SQL {
    return and(
      this.tenantFilter(tenantIdColumn, context),
      this.companyAccessFilter(companyIdColumn, context)
    )!;
  }

  /**
   * Check if context has access to a specific company.
   * Uses employee_accessible_companies table for O(1) lookup.
   */
  protected async hasCompanyAccess(
    context: AccessContext,
    companyId: string
  ): Promise<boolean> {
    const [result] = await this.db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM user_accessible_companies uac
        WHERE uac.user_id = ${context.userId}
          AND uac.company_id = ${companyId}
      ) as exists
    `);
    return result?.exists ?? false;
  }
}
