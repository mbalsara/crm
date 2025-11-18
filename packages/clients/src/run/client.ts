import { BaseClient } from '../base-client';
import type { ApiResponse } from '@crm/shared';
import type { Run, CreateRunRequest, UpdateRunRequest } from './types';

/**
 * Client for run-related API operations
 */
export class RunClient extends BaseClient {
  /**
   * Create a new run
   */
  async create(data: CreateRunRequest): Promise<Run> {
    const response = await this.post<ApiResponse<Run>>('/api/runs', data);
    if (!response?.data) {
      throw new Error('Invalid API response: missing data');
    }
    return response.data;
  }

  /**
   * Update a run
   */
  async update(runId: string, data: UpdateRunRequest): Promise<Run> {
    const response = await this.patch<ApiResponse<Run>>(`/api/runs/${runId}`, data);
    if (!response?.data) {
      throw new Error('Invalid API response: missing data');
    }
    return response.data;
  }

  /**
   * Get run by ID
   */
  async getById(runId: string): Promise<Run | null> {
    const response = await this.get<ApiResponse<Run>>(`/api/runs/${runId}`);
    return response?.data ?? null;
  }

  /**
   * Find runs by tenant ID
   */
  async findByTenant(tenantId: string, limit: number = 10): Promise<Run[]> {
    const response = await this.get<ApiResponse<Run[]>>(
      `/api/runs?tenantId=${encodeURIComponent(tenantId)}&limit=${limit}`
    );
    return response?.data ?? [];
  }

  /**
   * Find runs by integration ID
   */
  async findByIntegration(integrationId: string, limit: number = 10): Promise<Run[]> {
    const response = await this.get<ApiResponse<Run[]>>(
      `/api/runs?integrationId=${encodeURIComponent(integrationId)}&limit=${limit}`
    );
    return response?.data ?? [];
  }
}
