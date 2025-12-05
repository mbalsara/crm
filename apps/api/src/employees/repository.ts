import { eq, and, sql } from 'drizzle-orm';
import { injectable, inject } from 'tsyringe';
import type { Database } from '@crm/database';
import {
  employees,
  employeeManagers,
  employeeCompanies,
  employeeAccessibleCompanies,
  type Employee,
  type NewEmployee,
  type EmployeeManager,
  type NewEmployeeManager,
  type EmployeeCompany,
  type NewEmployeeCompany,
  RowStatus,
} from './schema';
import { logger } from '../utils/logger';

export interface RebuildResult {
  deletedCount: number;
  insertedCount: number;
  durationMs: number;
}

@injectable()
export class EmployeeRepository {
  constructor(@inject('Database') private db: Database) {}

  // ===========================================================================
  // Employee CRUD
  // ===========================================================================

  async findById(id: string): Promise<Employee | undefined> {
    const result = await this.db
      .select()
      .from(employees)
      .where(eq(employees.id, id));
    return result[0];
  }

  async findByEmail(tenantId: string, email: string): Promise<Employee | undefined> {
    const result = await this.db
      .select()
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.email, email)));
    return result[0];
  }

  async findByTenantId(tenantId: string): Promise<Employee[]> {
    return this.db
      .select()
      .from(employees)
      .where(eq(employees.tenantId, tenantId));
  }

  async findActiveByTenantId(tenantId: string): Promise<Employee[]> {
    return this.db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.tenantId, tenantId),
          eq(employees.rowStatus, RowStatus.ACTIVE)
        )
      );
  }

  async create(data: NewEmployee): Promise<Employee> {
    const result = await this.db.insert(employees).values(data).returning();
    return result[0];
  }

  async upsert(data: NewEmployee): Promise<Employee> {
    const result = await this.db
      .insert(employees)
      .values(data)
      .onConflictDoUpdate({
        target: [employees.tenantId, employees.email],
        set: {
          firstName: data.firstName,
          lastName: data.lastName,
          rowStatus: data.rowStatus,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  }

  async update(id: string, data: Partial<NewEmployee>): Promise<Employee | undefined> {
    const result = await this.db
      .update(employees)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();
    return result[0];
  }

  // ===========================================================================
  // Manager Relationships
  // ===========================================================================

  async getManagers(employeeId: string): Promise<Employee[]> {
    const result = await this.db
      .select({ manager: employees })
      .from(employeeManagers)
      .innerJoin(employees, eq(employees.id, employeeManagers.managerId))
      .where(eq(employeeManagers.employeeId, employeeId));
    return result.map((r) => r.manager);
  }

  async getDirectReports(managerId: string): Promise<Employee[]> {
    const result = await this.db
      .select({ employee: employees })
      .from(employeeManagers)
      .innerJoin(employees, eq(employees.id, employeeManagers.employeeId))
      .where(eq(employeeManagers.managerId, managerId));
    return result.map((r) => r.employee);
  }

  async addManager(employeeId: string, managerId: string): Promise<EmployeeManager> {
    const result = await this.db
      .insert(employeeManagers)
      .values({ employeeId, managerId })
      .onConflictDoNothing()
      .returning();
    return result[0];
  }

  async removeManager(employeeId: string, managerId: string): Promise<void> {
    await this.db
      .delete(employeeManagers)
      .where(
        and(
          eq(employeeManagers.employeeId, employeeId),
          eq(employeeManagers.managerId, managerId)
        )
      );
  }

  async clearManagers(employeeId: string): Promise<void> {
    await this.db
      .delete(employeeManagers)
      .where(eq(employeeManagers.employeeId, employeeId));
  }

  async setManagers(employeeId: string, managerIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Clear existing
      await tx
        .delete(employeeManagers)
        .where(eq(employeeManagers.employeeId, employeeId));

      // Add new
      if (managerIds.length > 0) {
        await tx.insert(employeeManagers).values(
          managerIds.map((managerId) => ({ employeeId, managerId }))
        );
      }
    });
  }

  // ===========================================================================
  // Company Assignments
  // ===========================================================================

  async getCompanyAssignments(employeeId: string): Promise<EmployeeCompany[]> {
    return this.db
      .select()
      .from(employeeCompanies)
      .where(eq(employeeCompanies.employeeId, employeeId));
  }

  async addCompanyAssignment(
    employeeId: string,
    companyId: string,
    role?: string
  ): Promise<EmployeeCompany> {
    const result = await this.db
      .insert(employeeCompanies)
      .values({ employeeId, companyId, role })
      .onConflictDoUpdate({
        target: [employeeCompanies.employeeId, employeeCompanies.companyId],
        set: { role },
      })
      .returning();
    return result[0];
  }

  async removeCompanyAssignment(employeeId: string, companyId: string): Promise<void> {
    await this.db
      .delete(employeeCompanies)
      .where(
        and(
          eq(employeeCompanies.employeeId, employeeId),
          eq(employeeCompanies.companyId, companyId)
        )
      );
  }

  async clearCompanyAssignments(employeeId: string): Promise<void> {
    await this.db
      .delete(employeeCompanies)
      .where(eq(employeeCompanies.employeeId, employeeId));
  }

  async setCompanyAssignments(
    employeeId: string,
    assignments: Array<{ companyId: string; role?: string }>
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Clear existing
      await tx
        .delete(employeeCompanies)
        .where(eq(employeeCompanies.employeeId, employeeId));

      // Add new
      if (assignments.length > 0) {
        await tx.insert(employeeCompanies).values(
          assignments.map((a) => ({
            employeeId,
            companyId: a.companyId,
            role: a.role,
          }))
        );
      }
    });
  }

  // ===========================================================================
  // Accessible Companies (Denormalized)
  // ===========================================================================

  async getAccessibleCompanyIds(employeeId: string): Promise<string[]> {
    const result = await this.db
      .select({ companyId: employeeAccessibleCompanies.companyId })
      .from(employeeAccessibleCompanies)
      .where(eq(employeeAccessibleCompanies.employeeId, employeeId));
    return result.map((r) => r.companyId);
  }

  async hasAccessToCompany(employeeId: string, companyId: string): Promise<boolean> {
    const result = await this.db
      .select({ exists: sql<boolean>`true` })
      .from(employeeAccessibleCompanies)
      .where(
        and(
          eq(employeeAccessibleCompanies.employeeId, employeeId),
          eq(employeeAccessibleCompanies.companyId, companyId)
        )
      )
      .limit(1);
    return result.length > 0;
  }

  /**
   * Rebuild the employee_accessible_companies table for a tenant.
   *
   * This uses a recursive CTE to traverse the manager hierarchy and compute
   * all companies each employee can access (their own + all descendants').
   *
   * Called by Inngest with 5-minute debounce after any change to
   * employee_managers or employee_companies.
   */
  async rebuildAccessibleCompanies(tenantId: string): Promise<RebuildResult> {
    const start = Date.now();
    const rebuiltAt = new Date();

    await this.db.transaction(async (tx) => {
      // Delete existing rows for this tenant
      await tx.execute(sql`
        DELETE FROM employee_accessible_companies
        WHERE employee_id IN (
          SELECT id FROM employees WHERE tenant_id = ${tenantId}
        )
      `);

      // Rebuild using recursive CTE
      // 1. Start with each active employee as their own "ancestor"
      // 2. Recursively follow manager relationships to find all descendants
      // 3. For each ancestor, collect all companies assigned to any descendant
      await tx.execute(sql`
        WITH RECURSIVE hierarchy AS (
          -- Base case: each active employee is their own ancestor
          SELECT id AS ancestor_id, id AS descendant_id
          FROM employees
          WHERE tenant_id = ${tenantId}
            AND row_status = ${RowStatus.ACTIVE}

          UNION ALL

          -- Recursive case: follow manager relationships downward
          -- If A manages B, then A is an ancestor of B
          SELECT h.ancestor_id, em.employee_id AS descendant_id
          FROM hierarchy h
          JOIN employee_managers em ON em.manager_id = h.descendant_id
          JOIN employees e ON e.id = em.employee_id
            AND e.tenant_id = ${tenantId}
            AND e.row_status = ${RowStatus.ACTIVE}
        )
        INSERT INTO employee_accessible_companies (employee_id, company_id, rebuilt_at)
        SELECT DISTINCT h.ancestor_id, ec.company_id, ${rebuiltAt}
        FROM hierarchy h
        JOIN employee_companies ec ON ec.employee_id = h.descendant_id
      `);
    });

    // Count the results after rebuild
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(employeeAccessibleCompanies)
      .innerJoin(employees, eq(employees.id, employeeAccessibleCompanies.employeeId))
      .where(eq(employees.tenantId, tenantId));

    const insertedCount = Number(countResult[0]?.count ?? 0);
    const durationMs = Date.now() - start;

    logger.info(
      { tenantId, insertedCount, durationMs },
      'Rebuilt accessible companies'
    );

    return {
      deletedCount: 0, // Not tracked for simplicity
      insertedCount,
      durationMs,
    };
  }
}
