import { eq, and, sql } from 'drizzle-orm';
import { injectable, inject } from 'tsyringe';
import { ScopedRepository, type AccessContext } from '@crm/database';
import type { Database } from '@crm/database';
import {
  users,
  userManagers,
  userCompanies,
  userAccessibleCompanies,
  type User,
  type NewUser,
  type UserManager,
  type NewUserManager,
  type UserCompany,
  type NewUserCompany,
  RowStatus,
} from './schema';
import { logger } from '../utils/logger';

export interface RebuildResult {
  deletedCount: number;
  insertedCount: number;
  durationMs: number;
}

@injectable()
export class UserRepository extends ScopedRepository {
  constructor(@inject('Database') db: Database) {
    super(db);
  }

  // ===========================================================================
  // User CRUD
  // ===========================================================================

  async findById(id: string, context?: AccessContext): Promise<User | undefined> {
    // Build where clause with optional tenant isolation
    const whereClause = context
      ? and(eq(users.id, id), this.tenantFilter(users.tenantId, context))
      : eq(users.id, id);

    const result = await this.db.select().from(users).where(whereClause);
    return result[0];
  }

  async findByEmail(tenantId: string, email: string): Promise<User | undefined> {
    const result = await this.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, email)));
    return result[0];
  }

  async findByTenantId(tenantId: string): Promise<User[]> {
    return this.db
      .select()
      .from(users)
      .where(eq(users.tenantId, tenantId));
  }

  async findActiveByTenantId(tenantId: string): Promise<User[]> {
    return this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.rowStatus, RowStatus.ACTIVE)
        )
      );
  }

  async create(data: NewUser): Promise<User> {
    const result = await this.db.insert(users).values(data).returning();
    return result[0];
  }

  async upsert(data: NewUser): Promise<User> {
    const result = await this.db
      .insert(users)
      .values(data)
      .onConflictDoUpdate({
        target: [users.tenantId, users.email],
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

  async update(id: string, data: Partial<NewUser>): Promise<User | undefined> {
    const result = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  // ===========================================================================
  // Manager Relationships
  // ===========================================================================

  async getManagers(userId: string): Promise<User[]> {
    const result = await this.db
      .select({ manager: users })
      .from(userManagers)
      .innerJoin(users, eq(users.id, userManagers.managerId))
      .where(eq(userManagers.userId, userId));
    return result.map((r) => r.manager);
  }

  async getDirectReports(managerId: string): Promise<User[]> {
    const result = await this.db
      .select({ user: users })
      .from(userManagers)
      .innerJoin(users, eq(users.id, userManagers.userId))
      .where(eq(userManagers.managerId, managerId));
    return result.map((r) => r.user);
  }

  async addManager(userId: string, managerId: string): Promise<UserManager> {
    const result = await this.db
      .insert(userManagers)
      .values({ userId, managerId })
      .onConflictDoNothing()
      .returning();
    return result[0];
  }

  async removeManager(userId: string, managerId: string): Promise<void> {
    await this.db
      .delete(userManagers)
      .where(
        and(
          eq(userManagers.userId, userId),
          eq(userManagers.managerId, managerId)
        )
      );
  }

  async clearManagers(userId: string): Promise<void> {
    await this.db
      .delete(userManagers)
      .where(eq(userManagers.userId, userId));
  }

  async setManagers(userId: string, managerIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Clear existing
      await tx
        .delete(userManagers)
        .where(eq(userManagers.userId, userId));

      // Add new
      if (managerIds.length > 0) {
        await tx.insert(userManagers).values(
          managerIds.map((managerId) => ({ userId, managerId }))
        );
      }
    });
  }

  // ===========================================================================
  // Company Assignments
  // ===========================================================================

  async getCompanyAssignments(userId: string): Promise<UserCompany[]> {
    return this.db
      .select()
      .from(userCompanies)
      .where(eq(userCompanies.userId, userId));
  }

  async addCompanyAssignment(
    userId: string,
    companyId: string,
    role?: string
  ): Promise<UserCompany> {
    const result = await this.db
      .insert(userCompanies)
      .values({ userId, companyId, role })
      .onConflictDoUpdate({
        target: [userCompanies.userId, userCompanies.companyId],
        set: { role },
      })
      .returning();
    return result[0];
  }

  async removeCompanyAssignment(userId: string, companyId: string): Promise<void> {
    await this.db
      .delete(userCompanies)
      .where(
        and(
          eq(userCompanies.userId, userId),
          eq(userCompanies.companyId, companyId)
        )
      );
  }

  async clearCompanyAssignments(userId: string): Promise<void> {
    await this.db
      .delete(userCompanies)
      .where(eq(userCompanies.userId, userId));
  }

  async setCompanyAssignments(
    userId: string,
    assignments: Array<{ companyId: string; role?: string }>
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Clear existing
      await tx
        .delete(userCompanies)
        .where(eq(userCompanies.userId, userId));

      // Add new
      if (assignments.length > 0) {
        await tx.insert(userCompanies).values(
          assignments.map((a) => ({
            userId,
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

  async getAccessibleCompanyIds(userId: string): Promise<string[]> {
    const result = await this.db
      .select({ companyId: userAccessibleCompanies.companyId })
      .from(userAccessibleCompanies)
      .where(eq(userAccessibleCompanies.userId, userId));
    return result.map((r) => r.companyId);
  }

  async hasAccessToCompany(userId: string, companyId: string): Promise<boolean> {
    const result = await this.db
      .select({ exists: sql<boolean>`true` })
      .from(userAccessibleCompanies)
      .where(
        and(
          eq(userAccessibleCompanies.userId, userId),
          eq(userAccessibleCompanies.companyId, companyId)
        )
      )
      .limit(1);
    return result.length > 0;
  }

  /**
   * Rebuild the user_accessible_companies table for a tenant.
   *
   * This uses a recursive CTE to traverse the manager hierarchy and compute
   * all companies each user can access (their own + all descendants').
   *
   * Called by Inngest with 5-minute debounce after any change to
   * user_managers or user_companies.
   */
  async rebuildAccessibleCompanies(tenantId: string): Promise<RebuildResult> {
    const start = Date.now();
    const rebuiltAt = new Date();

    await this.db.transaction(async (tx) => {
      // Delete existing rows for this tenant
      await tx.execute(sql`
        DELETE FROM user_accessible_companies
        WHERE user_id IN (
          SELECT id FROM users WHERE tenant_id = ${tenantId}
        )
      `);

      // Rebuild using recursive CTE
      // 1. Start with each active user as their own "ancestor"
      // 2. Recursively follow manager relationships to find all descendants
      // 3. For each ancestor, collect all companies assigned to any descendant
      await tx.execute(sql`
        WITH RECURSIVE hierarchy AS (
          -- Base case: each active user is their own ancestor
          SELECT id AS ancestor_id, id AS descendant_id
          FROM users
          WHERE tenant_id = ${tenantId}
            AND row_status = ${RowStatus.ACTIVE}

          UNION ALL

          -- Recursive case: follow manager relationships downward
          -- If A manages B, then A is an ancestor of B
          SELECT h.ancestor_id, um.user_id AS descendant_id
          FROM hierarchy h
          JOIN user_managers um ON um.manager_id = h.descendant_id
          JOIN users u ON u.id = um.user_id
            AND u.tenant_id = ${tenantId}
            AND u.row_status = ${RowStatus.ACTIVE}
        )
        INSERT INTO user_accessible_companies (user_id, company_id, rebuilt_at)
        SELECT DISTINCT h.ancestor_id, uc.company_id, ${rebuiltAt}
        FROM hierarchy h
        JOIN user_companies uc ON uc.user_id = h.descendant_id
      `);
    });

    // Count the results after rebuild
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(userAccessibleCompanies)
      .innerJoin(users, eq(users.id, userAccessibleCompanies.userId))
      .where(eq(users.tenantId, tenantId));

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
