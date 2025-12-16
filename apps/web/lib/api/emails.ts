import { getEmailClient } from './clients';
import type { EmailsByCompanyResponse, EmailResponse } from '@crm/clients';

export type { EmailsByCompanyResponse, EmailResponse };

/**
 * Get emails for a company (via domain matching)
 */
export async function getEmailsByCompany(
  tenantId: string,
  companyId: string,
  options?: { limit?: number; offset?: number }
): Promise<EmailsByCompanyResponse> {
  return getEmailClient().getByCompany(tenantId, companyId, options);
}
