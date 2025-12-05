import { SQL, and, eq, gte, lte, ilike, inArray, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { ValidationError } from '@crm/shared';
import type { Database } from './db';
import { buildCondition, escapeLikePattern } from './search-condition-builder';

export interface FieldMapping {
  [key: string]: PgColumn;
}

export interface SearchContext {
  userId: string; // User ID (same as employee - used for access control)
  tenantId: string;
}

export interface SearchQuery {
  field: string;
  operator: string;
  value: unknown;
}

/**
 * Builder for constructing scoped search queries with access control.
 * 
 * Automatically adds tenant isolation and optionally company access filters.
 */
export class ScopedSearchBuilder<T extends PgTable> {
  private conditions: (SQL | undefined)[] = [];

  constructor(
    private db: Database,
    private table: T,
    private fieldMapping: FieldMapping,
    private context: SearchContext
  ) {
    // Tenant isolation is ALWAYS added first
    const tenantColumn = this.fieldMapping['tenantId'];
    if (tenantColumn) {
      this.conditions.push(eq(tenantColumn, context.tenantId));
    }
  }

  /**
   * Add company access scope.
   * Call this for tables that have a companyId column.
   */
  withCompanyScope(companyIdColumn?: PgColumn): this {
    const column = companyIdColumn || this.fieldMapping['companyId'];
    if (column) {
      this.conditions.push(
        sql`${column} IN (
          SELECT uc.company_id
          FROM user_hierarchy uh
          JOIN user_companies uc ON uc.user_id = uh.descendant_id
          WHERE uh.ancestor_id = ${this.context.userId}
        )`
      );
    }
    return this;
  }

  /**
   * Apply search queries from API request.
   */
  applyQueries(queries: SearchQuery[]): this {
    for (const query of queries) {
      const column = this.fieldMapping[query.field];
      if (!column) {
        throw new ValidationError(`Field '${query.field}' is not searchable`);
      }
      const condition = buildCondition(column, query.operator, query.value);
      if (condition) {
        this.conditions.push(condition);
      }
    }
    return this;
  }

  /**
   * Add a custom condition.
   */
  where(condition: SQL | undefined): this {
    if (condition) {
      this.conditions.push(condition);
    }
    return this;
  }

  /**
   * Add a condition only if value is present.
   */
  whereIf<V>(
    value: V | undefined | null,
    buildCondition: (v: V) => SQL | undefined
  ): this {
    if (value !== undefined && value !== null && value !== '') {
      const condition = buildCondition(value);
      if (condition) {
        this.conditions.push(condition);
      }
    }
    return this;
  }

  /**
   * Add equals condition if value is present.
   */
  whereEq(column: PgColumn, value: unknown | undefined): this {
    return this.whereIf(value, (v) => eq(column, v));
  }

  /**
   * Add ILIKE condition if value is present (case-insensitive).
   */
  whereLike(column: PgColumn, value: string | undefined): this {
    return this.whereIf(value, (v) => ilike(column, escapeLikePattern(v)));
  }

  /**
   * Add IN condition if array has values.
   */
  whereIn(column: PgColumn, values: unknown[] | undefined): this {
    if (values && values.length > 0) {
      this.conditions.push(inArray(column, values));
    }
    return this;
  }

  /**
   * Add date range condition.
   */
  whereDateRange(
    column: PgColumn,
    from: Date | string | undefined,
    to: Date | string | undefined
  ): this {
    if (from) {
      this.conditions.push(gte(column, from));
    }
    if (to) {
      this.conditions.push(lte(column, to));
    }
    return this;
  }

  /**
   * Build the final WHERE clause.
   * Returns undefined if no conditions (though tenant filter should always be present).
   */
  build(): SQL | undefined {
    const validConditions = this.conditions.filter(Boolean) as SQL[];
    if (validConditions.length === 0) {
      return undefined;
    }
    if (validConditions.length === 1) {
      return validConditions[0];
    }
    return and(...validConditions);
  }
}

/**
 * Factory function for cleaner usage.
 */
export function scopedSearch<T extends PgTable>(
  db: Database,
  table: T,
  fieldMapping: FieldMapping,
  context: SearchContext
): ScopedSearchBuilder<T> {
  return new ScopedSearchBuilder(db, table, fieldMapping, context);
}
