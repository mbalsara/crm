import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';

// Query keys for cache management
export const emailKeys = {
  all: ['emails'] as const,
  byCompany: (tenantId: string, companyId: string, options?: { limit?: number; offset?: number }) =>
    [...emailKeys.all, 'company', tenantId, companyId, options] as const,
};

/**
 * Hook to get emails for a company (via domain matching)
 */
export function useEmailsByCompany(
  tenantId: string,
  companyId: string,
  options?: { limit?: number; offset?: number }
) {
  return useQuery({
    queryKey: emailKeys.byCompany(tenantId, companyId, options),
    queryFn: () => api.getEmailsByCompany(tenantId, companyId, options),
    enabled: !!tenantId && !!companyId,
  });
}
