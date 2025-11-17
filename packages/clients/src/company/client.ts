import { injectable } from 'tsyringe';
import { z } from 'zod';
import { BaseClient } from '../base-client';

/**
 * Zod schema for creating/updating a company
 * Used for validation at API boundaries
 */
export const createCompanyRequestSchema = z.object({
  tenantId: z.string().uuid(),
  domain: z.string().min(1).max(255),
  domainType: z.enum(['business', 'personal', 'excluded']).optional().default('business'),
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
  domainType: z.string(),
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
    return await this.post<Company>('/api/companies', data);
  }

  /**
   * Get company by domain
   */
  async getCompanyByDomain(tenantId: string, domain: string): Promise<Company | null> {
    const encodedDomain = encodeURIComponent(domain);
    return await this.get<Company>(`/api/companies/domain/${tenantId}/${encodedDomain}`);
  }

  /**
   * Get company by ID
   */
  async getCompanyById(id: string): Promise<Company | null> {
    return await this.get<Company>(`/api/companies/${id}`);
  }

  /**
   * Get all companies for a tenant
   */
  async getCompaniesByTenant(tenantId: string): Promise<Company[]> {
    const response = await this.get<Company[]>(`/api/companies/tenant/${tenantId}`);
    return response || [];
  }
}
