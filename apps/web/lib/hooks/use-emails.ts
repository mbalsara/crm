import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';

// Query keys for cache management
export const emailKeys = {
  all: ['emails'] as const,
  byCustomer: (tenantId: string, customerId: string, options?: { limit?: number; offset?: number }) =>
    [...emailKeys.all, 'customer', tenantId, customerId, options] as const,
  // Backwards compatibility alias
  byCompany: (tenantId: string, companyId: string, options?: { limit?: number; offset?: number }) =>
    emailKeys.byCustomer(tenantId, companyId, options),
};

/**
 * Hook to get emails for a customer (via domain matching)
 */
export function useEmailsByCustomer(
  tenantId: string,
  customerId: string,
  options?: { limit?: number; offset?: number }
) {
  return useQuery({
    queryKey: emailKeys.byCustomer(tenantId, customerId, options),
    queryFn: () => api.getEmailsByCustomer(tenantId, customerId, options),
    enabled: !!tenantId && !!customerId,
  });
}

// Backwards compatibility alias
export const useEmailsByCompany = useEmailsByCustomer;
