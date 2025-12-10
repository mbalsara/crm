import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { SearchRequest, Company, CreateCompanyRequest } from '@/lib/api';

// Query keys for cache management
export const companyKeys = {
  all: ['companies'] as const,
  lists: () => [...companyKeys.all, 'list'] as const,
  list: (filters: SearchRequest) => [...companyKeys.lists(), filters] as const,
  byTenant: (tenantId: string) => [...companyKeys.all, 'tenant', tenantId] as const,
  details: () => [...companyKeys.all, 'detail'] as const,
  detail: (id: string) => [...companyKeys.details(), id] as const,
  byDomain: (tenantId: string, domain: string) =>
    [...companyKeys.all, 'domain', tenantId, domain] as const,
};

/**
 * Hook to search/list companies with pagination and filtering
 */
export function useCompanies(request: SearchRequest) {
  return useQuery({
    queryKey: companyKeys.list(request),
    queryFn: () => api.searchCompanies(request),
  });
}

/**
 * Hook to get all companies for a tenant
 */
export function useCompaniesByTenant(tenantId: string) {
  return useQuery({
    queryKey: companyKeys.byTenant(tenantId),
    queryFn: () => api.getCompaniesByTenant(tenantId),
    enabled: !!tenantId,
  });
}

/**
 * Hook to get a single company by ID
 */
export function useCompany(id: string) {
  return useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: () => api.getCompany(id),
    enabled: !!id,
  });
}

/**
 * Hook to get a company by domain
 */
export function useCompanyByDomain(tenantId: string, domain: string) {
  return useQuery({
    queryKey: companyKeys.byDomain(tenantId, domain),
    queryFn: () => api.getCompanyByDomain(tenantId, domain),
    enabled: !!tenantId && !!domain,
  });
}

/**
 * Hook to create or update a company
 */
export function useUpsertCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCompanyRequest) => api.upsertCompany(data),
    onSuccess: (company) => {
      // Update the cache for this specific company
      queryClient.setQueryData(companyKeys.detail(company.id), company);
      // Invalidate lists to refetch
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: companyKeys.byTenant(company.tenantId) });
    },
  });
}
