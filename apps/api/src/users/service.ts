import { injectable, inject } from 'tsyringe';
import { CustomerRepository } from '../customers/repository';
import { sql, desc, asc } from 'drizzle-orm';
import { NotFoundError, type SearchRequest, type SearchResponse } from '@crm/shared';
import { scopedSearch } from '@crm/database';
import type { Database } from '@crm/database';
import { UserRepository } from './repository';
import { inngest } from '../inngest/client';
import { logger } from '../utils/logger';
import { users, RowStatus } from './schema';
import type { User, NewUser, UserCompany } from './schema';
import type { RequestHeader } from '@crm/shared';

export interface UserWithRelations extends User {
  managers?: User[];
  companyAssignments?: UserCompany[];
}

@injectable()
export class UserService {
  private fieldMapping: {
    tenantId: typeof users.tenantId;
    firstName: typeof users.firstName;
    lastName: typeof users.lastName;
    email: typeof users.email;
    rowStatus: typeof users.rowStatus;
    createdAt: typeof users.createdAt;
    updatedAt: typeof users.updatedAt;
  };

  constructor(
    @inject('Database') private db: Database,
    @inject(UserRepository) private userRepository: UserRepository,
    @inject(CustomerRepository) private customerRepository: CustomerRepository
  ) {
    // Initialize field mapping
    this.fieldMapping = {
      tenantId: users.tenantId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      rowStatus: users.rowStatus,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    };
  }

  // ===========================================================================
  // User CRUD
  // ===========================================================================

  async getById(requestHeader: RequestHeader, id: string): Promise<User | undefined> {
    const context = {
      tenantId: requestHeader.tenantId,
      userId: requestHeader.userId,
    };
    return this.userRepository.findById(id, context);
  }

  async getByEmail(tenantId: string, email: string): Promise<User | undefined> {
    return this.userRepository.findByEmail(tenantId, email);
  }

  async getByTenantId(tenantId: string): Promise<User[]> {
    return this.userRepository.findByTenantId(tenantId);
  }

  async search(
    requestHeader: RequestHeader,
    searchRequest: SearchRequest
  ): Promise<SearchResponse<User>> {
    const context = {
      tenantId: requestHeader.tenantId,
      userId: requestHeader.userId,
    };

    // Build scoped search query with tenant isolation
    const where = scopedSearch(this.db, users, this.fieldMapping, context)
      .applyQueries(searchRequest.queries)
      .build();

    // Determine sort column
    const sortBy = searchRequest.sortBy as keyof typeof this.fieldMapping | undefined;
    const sortColumn = sortBy && this.fieldMapping[sortBy]
      ? this.fieldMapping[sortBy]
      : users.createdAt;
    const orderByClause = searchRequest.sortOrder === 'asc'
      ? asc(sortColumn)
      : desc(sortColumn);

    // Pagination
    const limit = searchRequest.limit || 20;
    const offset = searchRequest.offset || 0;

    // Execute search with sorting and pagination
    const items = await this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    // Get total count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(where);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async create(tenantId: string, data: Omit<NewUser, 'tenantId'>): Promise<User> {
    const user = await this.userRepository.create({
      ...data,
      tenantId,
    });

    logger.info(
      { tenantId, userId: user.id, email: user.email },
      'Created user'
    );

    return user;
  }

  async update(
    id: string,
    data: Partial<Omit<NewUser, 'tenantId'>>
  ): Promise<User | undefined> {
    const user = await this.userRepository.update(id, data);

    if (user) {
      logger.info({ userId: id }, 'Updated user');
    }

    return user;
  }

  async markActive(tenantId: string, id: string): Promise<User> {
    const user = await this.userRepository.update(id, {
      rowStatus: RowStatus.ACTIVE,
    });

    if (!user) {
      throw new NotFoundError('User', id);
    }

    logger.info({ tenantId, userId: id }, 'Marked user as active');
    await this.queueAccessRebuild(tenantId);

    return user;
  }

  async markInactive(tenantId: string, id: string): Promise<User> {
    const user = await this.userRepository.update(id, {
      rowStatus: RowStatus.INACTIVE,
    });

    if (!user) {
      throw new NotFoundError('User', id);
    }

    logger.info({ tenantId, userId: id }, 'Marked user as inactive');
    await this.queueAccessRebuild(tenantId);

    return user;
  }

  // ===========================================================================
  // Manager Relationships
  // ===========================================================================

  async getManagers(userId: string): Promise<User[]> {
    return this.userRepository.getManagers(userId);
  }

  async getDirectReports(managerId: string): Promise<User[]> {
    return this.userRepository.getDirectReports(managerId);
  }

  async addManager(
    tenantId: string,
    userId: string,
    managerId: string
  ): Promise<void> {
    await this.userRepository.addManager(userId, managerId);

    logger.info(
      { tenantId, userId, managerId },
      'Added manager relationship'
    );

    await this.queueAccessRebuild(tenantId);
  }

  async removeManager(
    tenantId: string,
    userId: string,
    managerId: string
  ): Promise<void> {
    await this.userRepository.removeManager(userId, managerId);

    logger.info(
      { tenantId, userId, managerId },
      'Removed manager relationship'
    );

    await this.queueAccessRebuild(tenantId);
  }

  async setManagers(
    tenantId: string,
    userId: string,
    managerIds: string[]
  ): Promise<void> {
    await this.userRepository.setManagers(userId, managerIds);

    logger.info(
      { tenantId, userId, managerCount: managerIds.length },
      'Set managers for user'
    );

    await this.queueAccessRebuild(tenantId);
  }

  // ===========================================================================
  // Company Assignments
  // ===========================================================================

  async getCompanyAssignments(userId: string): Promise<UserCompany[]> {
    return this.userRepository.getCompanyAssignments(userId);
  }

  async addCompanyAssignment(
    tenantId: string,
    userId: string,
    companyId: string,
    role?: string
  ): Promise<void> {
    await this.userRepository.addCompanyAssignment(userId, companyId, role);

    logger.info(
      { tenantId, userId, companyId, role },
      'Added company assignment'
    );

    await this.queueAccessRebuild(tenantId);
  }

  async removeCompanyAssignment(
    tenantId: string,
    userId: string,
    companyId: string
  ): Promise<void> {
    await this.userRepository.removeCompanyAssignment(userId, companyId);

    logger.info(
      { tenantId, userId, companyId },
      'Removed company assignment'
    );

    await this.queueAccessRebuild(tenantId);
  }

  async setCompanyAssignments(
    tenantId: string,
    userId: string,
    assignments: Array<{ companyId: string; role?: string }>
  ): Promise<void> {
    await this.userRepository.setCompanyAssignments(userId, assignments);

    logger.info(
      { tenantId, userId, assignmentCount: assignments.length },
      'Set company assignments for user'
    );

    await this.queueAccessRebuild(tenantId);
  }

  // ===========================================================================
  // Access Control
  // ===========================================================================

  async getAccessibleCompanyIds(userId: string): Promise<string[]> {
    return this.userRepository.getAccessibleCompanyIds(userId);
  }

  async hasAccessToCompany(userId: string, companyId: string): Promise<boolean> {
    return this.userRepository.hasAccessToCompany(userId, companyId);
  }

  // ===========================================================================
  // Rebuild (called by Inngest)
  // ===========================================================================

  async rebuildAccessibleCompanies(tenantId: string): Promise<void> {
    await this.userRepository.rebuildAccessibleCompanies(tenantId);
  }

  // ===========================================================================
  // Import/Export
  // ===========================================================================

  async importUsers(
    tenantId: string,
    csvContent: string
  ): Promise<{ imported: number; errors: Array<{ row: number; email: string; error: string }> }> {
    const { parseCSV, parseManagerEmails, groupImportRows } = await import('./import-export');
    const rows = parseCSV(csvContent);
    const grouped = groupImportRows(rows);

    const errors: Array<{ row: number; email: string; error: string }> = [];
    let imported = 0;

    for (const [email, userRows] of grouped.entries()) {
      try {
        // Use first row for user data
        const firstRow = userRows[0];

        // Create or update user
        const user = await this.userRepository.upsert({
          tenantId,
          firstName: firstRow.firstName,
          lastName: firstRow.lastName,
          email: firstRow.email,
          rowStatus: firstRow.active === '1' ? RowStatus.INACTIVE : RowStatus.ACTIVE,
        });

        // Add managers
        const managerEmails = parseManagerEmails(firstRow.managerEmails);
        if (managerEmails.length > 0) {
          const managerIds: string[] = [];
          for (const managerEmail of managerEmails) {
            const manager = await this.getByEmail(tenantId, managerEmail);
            if (manager) {
              managerIds.push(manager.id);
            } else {
              errors.push({
                row: rows.indexOf(firstRow) + 1,
                email: firstRow.email,
                error: `Manager not found: ${managerEmail}`,
              });
            }
          }
          if (managerIds.length > 0) {
            await this.setManagers(tenantId, user.id, managerIds);
          }
        }

        // Add companies (one row per company)
        const assignments: Array<{ companyId: string }> = [];
        const seenCompanyIds = new Set<string>();
        for (const row of userRows) {
          if (row.companyDomain && row.companyDomain.trim() !== '') {
            const company = await this.customerRepository.findByDomain(tenantId, row.companyDomain);
            if (company) {
              // Avoid duplicates
              if (!seenCompanyIds.has(company.id)) {
                assignments.push({ companyId: company.id });
                seenCompanyIds.add(company.id);
              }
            } else {
              errors.push({
                row: rows.indexOf(row) + 1,
                email: row.email,
                error: `Company not found: ${row.companyDomain}`,
              });
            }
          }
        }
        if (assignments.length > 0) {
          await this.setCompanyAssignments(tenantId, user.id, assignments);
        }

        imported++;
      } catch (error: any) {
        errors.push({
          row: rows.indexOf(userRows[0]) + 1,
          email: userRows[0].email,
          error: error.message || 'Unknown error',
        });
      }
    }

    // Queue rebuild after import
    await this.queueAccessRebuild(tenantId);

    return { imported, errors };
  }

  async exportUsers(tenantId: string): Promise<string> {
    const { generateCSV } = await import('./import-export');
    const users = await this.getByTenantId(tenantId);

    const exportData = await Promise.all(
      users.map(async (user) => {
        const managers = await this.getManagers(user.id);
        const companyAssignments = await this.getCompanyAssignments(user.id);

        // Get company domains
        const companies = await Promise.all(
          companyAssignments.map(async (assignment) => {
            const domains = await this.customerRepository.getDomains(assignment.companyId);
            return {
              domain: domains.length > 0 ? domains[0] : '',
            };
          })
        );

        return {
          user,
          managers: managers.map((m) => ({ email: m.email })),
          companies: companies.filter((c) => c.domain && c.domain.length > 0),
        };
      })
    );

    return generateCSV(exportData);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Queue a rebuild of the user_accessible_companies table.
   * Uses Inngest debounce (5 minutes) to batch rapid changes.
   */
  private async queueAccessRebuild(tenantId: string): Promise<void> {
    try {
      await inngest.send({
        name: 'user/access.rebuild',
        data: { tenantId },
      });

      logger.debug({ tenantId }, 'Queued access rebuild');
    } catch (error) {
      // Log but don't fail the operation - rebuild will happen eventually
      logger.error(
        { error, tenantId },
        'Failed to queue access rebuild'
      );
    }
  }
}
