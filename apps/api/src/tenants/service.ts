import { injectable } from 'tsyringe';
import { type RequestHeader } from '@crm/shared';
import { TenantRepository } from './repository';

@injectable()
export class TenantService {
  constructor(private tenantRepo: TenantRepository) {}

  /**
   * Create a new tenant
   */
  async create(requestHeader: RequestHeader, data: { name: string }) {
    if (!data.name) {
      throw new Error('name is required');
    }

    return this.tenantRepo.create(requestHeader, data);
  }

  /**
   * Get tenant by ID
   */
  async findById(tenantId: string) {
    return this.tenantRepo.findById(tenantId);
  }
}
