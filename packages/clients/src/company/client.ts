import { injectable } from 'tsyringe';
import { z } from 'zod';
import { BaseClient } from '../base-client';
import type { ApiResponse } from '@crm/shared';

/**
 * Zod schema for creating/updating a company
 * Used for validation at API boundaries
 */
export const createCompanyRequestSchema = z.object({
  tenantId: z.string().uuid(),
  domain: z.string().min(1).max(255),
  name: z.string().optional(),
  website: z.string().url().optional(),
  industry: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>;

/**
 * Zod schema for Company response
 */
export const companySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  domain: z.string(),
  name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Company = z.infer<typeof companySchema>;

/**
 * Client for company-related API operations
 */
@injectable()
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
