import { getEmailClient } from './clients';
import type { EmailsByCustomerResponse, EmailResponse } from '@crm/clients';

export type { EmailsByCustomerResponse, EmailResponse };

/**
 * Get emails for a customer (via domain matching)
 * Supports filtering by sentiment and escalation status
 */
export async function getEmailsByCustomer(
  tenantId: string,
  customerId: string,
  options?: {
    limit?: number;
    offset?: number;
    sentiment?: 'positive' | 'negative' | 'neutral';
    escalation?: boolean;
  }
): Promise<EmailsByCustomerResponse> {
  return getEmailClient().getByCustomer(tenantId, customerId, options);
}

