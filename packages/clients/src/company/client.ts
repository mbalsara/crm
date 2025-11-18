import { BaseClient } from '../base-client';
import type { ApiResponse } from '@crm/shared';
import type { Company, CreateCompanyRequest } from './types';

/**
 * Client for company-related API operations
 */
export class CompanyClient extends BaseClient {
  /**
   * Create or update a company
   */
  async upsertCompany(data: CreateCompanyRequest): Promise<Company> {
    const response = await this.post<ApiResponse<Company>>('/api/companies', data);
    if (!response) {
      throw new Error('Invalid API response: response is null');
    }
    
    // The API always returns ApiResponse<T> format: { success: boolean, data?: T, error?: StructuredError }
    // Extract the data field
    const apiResponse = response as ApiResponse<Company>;
    if (!apiResponse.data) {
      throw new Error(`Invalid API response: missing data field. Response: ${JSON.stringify(response)}`);
    }
    return apiResponse.data;
  }

  /**
   * Get company by domain
   */
  async getCompanyByDomain(tenantId: string, domain: string): Promise<Company | null> {
    const encodedDomain = encodeURIComponent(domain);
    const response = await this.get<ApiResponse<Company>>(`/api/companies/domain/${tenantId}/${encodedDomain}`);
    return response?.data || null;
  }

  /**
   * Get company by ID
   */
  async getCompanyById(id: string): Promise<Company | null> {
    const response = await this.get<ApiResponse<Company>>(`/api/companies/${id}`);
    return response?.data || null;
  }

  /**
   * Get all companies for a tenant
   */
  async getCompaniesByTenant(tenantId: string): Promise<Company[]> {
    const response = await this.get<ApiResponse<Company[]>>(`/api/companies/tenant/${tenantId}`);
    return response?.data || [];
  }
}
