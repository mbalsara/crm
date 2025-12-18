import { injectable, inject } from 'tsyringe';
import { CustomerRepository } from '../customers/repository';
import { sql, desc, asc } from 'drizzle-orm';
import { NotFoundError, type SearchRequest, type SearchResponse, getCustomerRoleByName, getCustomerRoleName } from '@crm/shared';
import { scopedSearch } from '@crm/database';
import type { Database } from '@crm/database';
import { UserRepository } from './repository';
import { inngest } from '../inngest/client';
import { logger } from '../utils/logger';
import { users, RowStatus } from './schema';
import type { User, NewUser, UserCustomer } from './schema';
import type { RequestHeader } from '@crm/shared';

export interface UserWithRelations extends User {
  managers?: User[];
  customerAssignments?: UserCustomer[];
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
  ): Promise<SearchResponse<UserWithRelations>> {
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
    const userItems = await this.db
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

    // Include customer assignments if requested
    const includeCustomerAssignments = searchRequest.include?.includes('customerAssignments');
    let items: UserWithRelations[] = userItems;

    if (includeCustomerAssignments) {
      items = await Promise.all(
        userItems.map(async (user) => ({
          ...user,
          customerAssignments: await this.getCustomerAssignments(user.id),
        }))
      );
    }

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
  // Customer Assignments
  // ===========================================================================

  async getCustomerAssignments(userId: string): Promise<UserCustomer[]> {
    return this.userRepository.getCustomerAssignments(userId);
  }

  async addCustomerAssignment(
    tenantId: string,
    userId: string,
    customerId: string,
    roleId?: string
  ): Promise<void> {
    await this.userRepository.addCustomerAssignment(userId, customerId, roleId);

    logger.info(
      { tenantId, userId, customerId, roleId },
      'Added customer assignment'
    );

    await this.queueAccessRebuild(tenantId);
  }

  async removeCustomerAssignment(
    tenantId: string,
    userId: string,
    customerId: string
  ): Promise<void> {
    await this.userRepository.removeCustomerAssignment(userId, customerId);

    logger.info(
      { tenantId, userId, customerId },
      'Removed customer assignment'
    );

    await this.queueAccessRebuild(tenantId);
  }

  async setCustomerAssignments(
    tenantId: string,
    userId: string,
    assignments: Array<{ customerId: string; roleId?: string }>
  ): Promise<void> {
    await this.userRepository.setCustomerAssignments(userId, assignments);

    logger.info(
      { tenantId, userId, assignmentCount: assignments.length },
      'Set customer assignments for user'
    );

    await this.queueAccessRebuild(tenantId);
  }

  // ===========================================================================
  // Access Control
  // ===========================================================================

  async getAccessibleCustomerIds(userId: string): Promise<string[]> {
    return this.userRepository.getAccessibleCustomerIds(userId);
  }

  async hasAccessToCustomer(userId: string, customerId: string): Promise<boolean> {
    return this.userRepository.hasAccessToCustomer(userId, customerId);
  }

  // ===========================================================================
  // Rebuild (called by Inngest)
  // ===========================================================================

  async rebuildAccessibleCustomers(tenantId: string): Promise<void> {
    await this.userRepository.rebuildAccessibleCustomers(tenantId);
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

        // Add customers (one row per customer)
        const assignments: Array<{ customerId: string; roleId?: string }> = [];
        const seenCustomerIds = new Set<string>();
        for (const row of userRows) {
          if (row.customerDomain && row.customerDomain.trim() !== '') {
            const customer = await this.customerRepository.findByDomain(tenantId, row.customerDomain);
            if (customer) {
              // Avoid duplicates
              if (!seenCustomerIds.has(customer.id)) {
                // Parse role name to roleId
                let roleId: string | undefined;
                if (row.role && row.role.trim() !== '') {
                  const role = getCustomerRoleByName(row.role);
                  if (role) {
                    roleId = role.id;
                  } else {
                    errors.push({
                      row: rows.indexOf(row) + 1,
                      email: row.email,
                      error: `Invalid role: ${row.role}`,
                    });
                  }
                }
                assignments.push({ customerId: customer.id, roleId });
                seenCustomerIds.add(customer.id);
              }
            } else {
              errors.push({
                row: rows.indexOf(row) + 1,
                email: row.email,
                error: `Customer not found: ${row.customerDomain}`,
              });
            }
          }
        }
        if (assignments.length > 0) {
          await this.setCustomerAssignments(tenantId, user.id, assignments);
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
        const customerAssignments = await this.getCustomerAssignments(user.id);

        // Get customer domains and role names
        const customers = await Promise.all(
          customerAssignments.map(async (assignment) => {
            const domains = await this.customerRepository.getDomains(assignment.customerId);
            return {
              domain: domains.length > 0 ? domains[0] : '',
              roleName: getCustomerRoleName(assignment.roleId),
            };
          })
        );

        return {
          user,
          managers: managers.map((m) => ({ email: m.email })),
          customers: customers.filter((c) => c.domain && c.domain.length > 0),
        };
      })
    );

    return generateCSV(exportData);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Queue a rebuild of the user_accessible_customers table.
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
