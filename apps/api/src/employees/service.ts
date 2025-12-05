import { injectable } from 'tsyringe';
import { EmployeeRepository } from './repository';
import { CompanyRepository } from '../companies/repository';
import { inngest } from '../inngest/client';
import { logger } from '../utils/logger';
import type { Employee, NewEmployee, EmployeeCompany } from './schema';

export interface EmployeeWithRelations extends Employee {
  managers?: Employee[];
  companyAssignments?: EmployeeCompany[];
}

@injectable()
export class EmployeeService {
  constructor(
    private employeeRepository: EmployeeRepository,
    private companyRepository: CompanyRepository
  ) {}

  // ===========================================================================
  // Employee CRUD
  // ===========================================================================

  async getById(id: string): Promise<Employee | undefined> {
    return this.employeeRepository.findById(id);
  }

  async getByEmail(tenantId: string, email: string): Promise<Employee | undefined> {
    return this.employeeRepository.findByEmail(tenantId, email);
  }

  async getByTenantId(tenantId: string): Promise<Employee[]> {
    return this.employeeRepository.findByTenantId(tenantId);
  }

  async create(tenantId: string, data: Omit<NewEmployee, 'tenantId'>): Promise<Employee> {
    const employee = await this.employeeRepository.create({
      ...data,
      tenantId,
    });

    logger.info(
      { tenantId, employeeId: employee.id, email: employee.email },
      'Created employee'
    );

    return employee;
  }

  async update(
    id: string,
    data: Partial<Omit<NewEmployee, 'tenantId'>>
  ): Promise<Employee | undefined> {
    const employee = await this.employeeRepository.update(id, data);

    if (employee) {
      logger.info({ employeeId: id }, 'Updated employee');
    }

    return employee;
  }

  // ===========================================================================
  // Manager Relationships
  // ===========================================================================

  async getManagers(employeeId: string): Promise<Employee[]> {
    return this.employeeRepository.getManagers(employeeId);
  }

  async getDirectReports(managerId: string): Promise<Employee[]> {
    return this.employeeRepository.getDirectReports(managerId);
  }

  async addManager(
    tenantId: string,
    employeeId: string,
    managerId: string
  ): Promise<void> {
    await this.employeeRepository.addManager(employeeId, managerId);

    logger.info(
      { tenantId, employeeId, managerId },
      'Added manager relationship'
    );

    await this.queueAccessRebuild(tenantId);
  }

  async removeManager(
    tenantId: string,
    employeeId: string,
    managerId: string
  ): Promise<void> {
    await this.employeeRepository.removeManager(employeeId, managerId);

    logger.info(
      { tenantId, employeeId, managerId },
      'Removed manager relationship'
    );

    await this.queueAccessRebuild(tenantId);
  }

  async setManagers(
    tenantId: string,
    employeeId: string,
    managerIds: string[]
  ): Promise<void> {
    await this.employeeRepository.setManagers(employeeId, managerIds);

    logger.info(
      { tenantId, employeeId, managerCount: managerIds.length },
      'Set managers for employee'
    );

    await this.queueAccessRebuild(tenantId);
  }

  // ===========================================================================
  // Company Assignments
  // ===========================================================================

  async getCompanyAssignments(employeeId: string): Promise<EmployeeCompany[]> {
    return this.employeeRepository.getCompanyAssignments(employeeId);
  }

  async addCompanyAssignment(
    tenantId: string,
    employeeId: string,
    companyId: string,
    role?: string
  ): Promise<void> {
    await this.employeeRepository.addCompanyAssignment(employeeId, companyId, role);

    logger.info(
      { tenantId, employeeId, companyId, role },
      'Added company assignment'
    );

    await this.queueAccessRebuild(tenantId);
  }

  async removeCompanyAssignment(
    tenantId: string,
    employeeId: string,
    companyId: string
  ): Promise<void> {
    await this.employeeRepository.removeCompanyAssignment(employeeId, companyId);

    logger.info(
      { tenantId, employeeId, companyId },
      'Removed company assignment'
    );

    await this.queueAccessRebuild(tenantId);
  }

  async setCompanyAssignments(
    tenantId: string,
    employeeId: string,
    assignments: Array<{ companyId: string; role?: string }>
  ): Promise<void> {
    await this.employeeRepository.setCompanyAssignments(employeeId, assignments);

    logger.info(
      { tenantId, employeeId, assignmentCount: assignments.length },
      'Set company assignments for employee'
    );

    await this.queueAccessRebuild(tenantId);
  }

  // ===========================================================================
  // Access Control
  // ===========================================================================

  async getAccessibleCompanyIds(employeeId: string): Promise<string[]> {
    return this.employeeRepository.getAccessibleCompanyIds(employeeId);
  }

  async hasAccessToCompany(employeeId: string, companyId: string): Promise<boolean> {
    return this.employeeRepository.hasAccessToCompany(employeeId, companyId);
  }

  // ===========================================================================
  // Rebuild (called by Inngest)
  // ===========================================================================

  async rebuildAccessibleCompanies(tenantId: string): Promise<void> {
    await this.employeeRepository.rebuildAccessibleCompanies(tenantId);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Queue a rebuild of the employee_accessible_companies table.
   * Uses Inngest debounce (5 minutes) to batch rapid changes.
   */
  private async queueAccessRebuild(tenantId: string): Promise<void> {
    try {
      await inngest.send({
        name: 'employee/access.rebuild',
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
