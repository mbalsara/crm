import { injectable } from '@crm/shared';
import { RunRepository } from './repository';
import type { NewRun } from './schema';

@injectable()
export class RunService {
  constructor(private runRepo: RunRepository) {}

  /**
   * Create a new run
   */
  async create(data: NewRun) {
    return this.runRepo.create(data);
  }

  /**
   * Update a run
   */
  async update(
    id: string,
    data: {
      status?: 'running' | 'completed' | 'failed';
      completedAt?: Date;
      itemsProcessed?: number;
      itemsInserted?: number;
      itemsSkipped?: number;
      endToken?: string;
      errorMessage?: string;
      errorStack?: string;
      retryCount?: number;
    }
  ) {
    return this.runRepo.update(id, data);
  }

  /**
   * Get run by ID
   */
  async findById(id: string) {
    return this.runRepo.findById(id);
  }

  /**
   * Get runs for a tenant
   */
  async findByTenant(tenantId: string, options?: { limit?: number }) {
    return this.runRepo.findByTenant(tenantId, options);
  }

  /**
   * Get runs for an integration
   */
  async findByIntegration(integrationId: string, options?: { limit?: number }) {
    return this.runRepo.findByIntegration(integrationId, options);
  }

  /**
   * Get running jobs for integration
   */
  async findRunningByIntegration(integrationId: string) {
    return this.runRepo.findRunningByIntegration(integrationId);
  }

  /**
   * Get running jobs for tenant
   */
  async findRunningByTenant(tenantId: string) {
    return this.runRepo.findRunningByTenant(tenantId);
  }
}
