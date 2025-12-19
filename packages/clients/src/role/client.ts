import { BaseClient } from '../base-client';
import type { ApiResponse } from '@crm/shared';
import type {
  RoleResponse,
  CreateRoleRequest,
  UpdateRoleRequest,
} from './types';

/**
 * Client for role-related API operations
 */
export class RoleClient extends BaseClient {
  /**
   * List all roles for tenant
   */
  async list(signal?: AbortSignal): Promise<RoleResponse[]> {
    const response = await this.get<ApiResponse<RoleResponse[]>>('/api/roles', signal);
    return response?.data || [];
  }

  /**
   * Get role by ID
   */
  async getById(id: string, signal?: AbortSignal): Promise<RoleResponse | null> {
    const response = await this.get<ApiResponse<RoleResponse>>(`/api/roles/${id}`, signal);
    return response?.data || null;
  }

  /**
   * Create a role
   */
  async create(data: CreateRoleRequest, signal?: AbortSignal): Promise<RoleResponse> {
    const response = await this.post<ApiResponse<RoleResponse>>('/api/roles', data, signal);
    if (!response?.data) {
      throw new Error('Invalid API response: missing data');
    }
    return response.data;
  }

  /**
   * Update a role
   */
  async update(id: string, data: UpdateRoleRequest, signal?: AbortSignal): Promise<RoleResponse> {
    const response = await this.patch<ApiResponse<RoleResponse>>(`/api/roles/${id}`, data, signal);
    if (!response?.data) {
      throw new Error('Invalid API response: missing data');
    }
    return response.data;
  }

  /**
   * Delete a role (only custom roles, not system roles)
   */
  async remove(id: string, signal?: AbortSignal): Promise<void> {
    await super.delete<ApiResponse<void>>(`/api/roles/${id}`, signal);
  }
}
