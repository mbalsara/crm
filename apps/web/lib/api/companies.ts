import { getCompanyClient } from './clients';
import type { SearchRequest, SearchResponse } from '@crm/shared';
import type { Company, CreateCompanyRequest } from '@crm/clients';

/**
 * Get a company by ID
 */
export async function getCompany(id: string, signal?: AbortSignal): Promise<Company | null> {
  return getCompanyClient().getCompanyById(id, signal);
}

/**
 * Get a company by domain
 */
export async function getCompanyByDomain(
  tenantId: string,
  domain: string,
  signal?: AbortSignal
): Promise<Company | null> {
  return getCompanyClient().getCompanyByDomain(tenantId, domain, signal);
}

/**
 * Get all companies for a tenant
 */
export async function getCompaniesByTenant(
  tenantId: string,
  signal?: AbortSignal
): Promise<Company[]> {
  return getCompanyClient().getCompaniesByTenant(tenantId, signal);
}

/**
 * Search companies with filters and pagination
 */
export async function searchCompanies(
  request: SearchRequest,
  signal?: AbortSignal
): Promise<SearchResponse<Company>> {
  return getCompanyClient().search(request, signal);
}

/**
 * Create or update a company
 */
export async function upsertCompany(
  data: CreateCompanyRequest,
  signal?: AbortSignal
): Promise<Company> {
  return getCompanyClient().upsertCompany(data, signal);
}
