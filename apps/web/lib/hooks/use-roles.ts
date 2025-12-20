import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';

// Query keys for cache management
export const roleKeys = {
  all: ['roles'] as const,
  list: () => [...roleKeys.all, 'list'] as const,
};

/**
 * Hook to get all RBAC roles for the tenant
 */
export function useRoles() {
  return useQuery({
    queryKey: roleKeys.list(),
    queryFn: () => api.getRoles(),
  });
}
