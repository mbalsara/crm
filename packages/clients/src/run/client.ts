import { injectable } from 'tsyringe';
import { BaseClient } from '../base-client';

/**
 * Client for run-related API operations
 */
@injectable()
export class RunClient extends BaseClient {
  /**
   * Create a new run
   */
  async create(data: any): Promise<any> {
    const response = await this.post<{ run: any }>('/api/runs', data);
    return response.run;
  }

  /**
   * Update a run
   */
  async update(runId: string, data: any): Promise<any> {
    const response = await this.patch<{ run: any }>(`/api/runs/${runId}`, data);
    return response?.run;
  }

  /**
   * Get run by ID
   */
  async getById(runId: string): Promise<any> {
    const response = await super.get<{ run: any }>(`/api/runs/${runId}`);
    return response?.run ?? null;
  }

  /**
   * Find runs by tenant ID
   */
  async findByTenant(tenantId: string, limit: number = 10): Promise<any[]> {
    const response = await this.get<{ runs: any[] }>(
      `/api/runs?tenantId=${encodeURIComponent(tenantId)}&limit=${limit}`
    );
    return response?.runs ?? [];
  }

  /**
   * Find runs by integration ID
   */
  async findByIntegration(integrationId: string, limit: number = 10): Promise<any[]> {
    const response = await this.get<{ runs: any[] }>(
      `/api/runs?integrationId=${encodeURIComponent(integrationId)}&limit=${limit}`
    );
    return response?.runs ?? [];
  }
}
