import { getEmailClient } from './clients';
import type { EmailsByCustomerResponse, EmailResponse } from '@crm/clients';

export type { EmailsByCustomerResponse, EmailResponse };
// Backwards compatibility alias
export type EmailsByCompanyResponse = EmailsByCustomerResponse;

/**
 * Get emails for a customer (via domain matching)
 */
export async function getEmailsByCustomer(
  tenantId: string,
  customerId: string,
  options?: { limit?: number; offset?: number }
): Promise<EmailsByCustomerResponse> {
  return getEmailClient().getByCustomer(tenantId, customerId, options);
}

// Backwards compatibility alias
export const getEmailsByCompany = getEmailsByCustomer;
