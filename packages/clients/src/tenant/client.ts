import { injectable } from 'tsyringe';
import { BaseClient } from '../base-client';

/**
 * Client for tenant-related API operations
 */
@injectable()
export class TenantClient extends BaseClient {
  /**
   * Get tenant by ID
   */
  async getById(tenantId: string): Promise<any> {
    const response = await super.get<{ tenant: any }>(`/api/tenants/${tenantId}`);
    return response?.tenant ?? null;
  }
}
