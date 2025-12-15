import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { IntegrationSource } from '@/lib/api';

// Query keys for cache management
export const integrationKeys = {
  all: ['integrations'] as const,
  byTenantAndSource: (tenantId: string, source: IntegrationSource) =>
    [...integrationKeys.all, tenantId, source] as const,
};

/**
 * Hook to get Gmail integration status for a tenant
 */
export function useGmailIntegration(tenantId: string) {
  return useQuery({
    queryKey: integrationKeys.byTenantAndSource(tenantId, 'gmail'),
    queryFn: () => api.getIntegration(tenantId, 'gmail'),
    enabled: !!tenantId,
  });
}
