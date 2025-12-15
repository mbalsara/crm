import { getIntegrationClient } from './clients';
import type { Integration, IntegrationSource } from '@crm/clients';

/**
 * Get integration for a tenant and source
 */
export async function getIntegration(
  tenantId: string,
  source: IntegrationSource
): Promise<Integration | null> {
  const client = getIntegrationClient();
  return client.getByTenantAndSource(tenantId, source);
}
