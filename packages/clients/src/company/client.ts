import { BaseClient } from '../base-client';
import type { ApiResponse, SearchRequest, SearchResponse } from '@crm/shared';
import type { Company, CreateCompanyRequest } from './types';

/**
 * Client for company-related API operations
 */
export class CompanyClient extends BaseClient {
  /**
   * Create or update a company
   */
  async upsertCompany(data: CreateCompanyRequest, signal?: AbortSignal): Promise<Company> {
    const response = await this.post<ApiResponse<Company>>('/api/companies', data, signal);
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
  async getCompanyByDomain(tenantId: string, domain: string, signal?: AbortSignal): Promise<Company | null> {
    const encodedDomain = encodeURIComponent(domain);
    const response = await this.get<ApiResponse<Company>>(`/api/companies/domain/${tenantId}/${encodedDomain}`, signal);
    return response?.data || null;
  }

  /**
   * Get company by ID
   */
  async getCompanyById(id: string, signal?: AbortSignal): Promise<Company | null> {
    const response = await this.get<ApiResponse<Company>>(`/api/companies/${id}`, signal);
    return response?.data || null;
  }

  /**
   * Get all companies for a tenant
   */
  async getCompaniesByTenant(tenantId: string, signal?: AbortSignal): Promise<Company[]> {
    const response = await this.get<ApiResponse<Company[]>>(`/api/companies/tenant/${tenantId}`, signal);
    return response?.data || [];
  }

  /**
   * Search companies
   * Automatically cancels previous search requests when a new one is made
   */
  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse<Company>> {
    const response = await this.post<ApiResponse<SearchResponse<Company>>>(
      '/api/companies/search',
      request,
      signal
    );
    
    if (!response?.data) {
      throw new Error('Invalid API response: missing data');
    }
    
    return response.data;
  }
}
