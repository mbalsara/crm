import { injectable } from 'tsyringe';
import { BaseClient } from '../base-client';

/**
 * Client for integration-related API operations
 */
@injectable()
export class IntegrationClient extends BaseClient {
  /**
   * Get integration credentials (decrypted)
   */
  async getCredentials(tenantId: string, source: string): Promise<any> {
    const response = await this.get<{ credentials: any }>(
      `/api/integrations/${tenantId}/${source}/credentials`
    );
    return response?.credentials ?? null;
  }

  /**
   * Get integration details
   */
  async getByTenantAndSource(tenantId: string, source: string): Promise<any> {
    return await super.get<any>(`/api/integrations/${tenantId}/${source}`);
  }

  /**
   * Update integration keys (re-encrypts)
   */
  async updateKeys(tenantId: string, source: string, keys: any): Promise<void> {
    await this.patch(`/api/integrations/${tenantId}/${source}/keys`, { keys });
  }

  /**
   * Update OAuth token expiration
   */
  async updateTokenExpiration(tenantId: string, source: string, expiresAt: Date): Promise<void> {
    await this.put(`/api/integrations/${tenantId}/${source}/token-expiration`, {
      expiresAt: expiresAt.toISOString(),
    });
  }

  /**
   * Find tenant ID by email address (for webhook lookup)
   */
  async findTenantByEmail(email: string, source: string = 'gmail'): Promise<string | null> {
    const response = await this.get<{ tenantId: string }>(
      `/api/integrations/lookup/by-email?email=${encodeURIComponent(email)}&source=${source}`
    );
    return response?.tenantId ?? null;
  }

  /**
   * Update run state (lastRunToken, lastRunAt)
   */
  async updateRunState(
    tenantId: string,
    source: string,
    state: { lastRunToken?: string; lastRunAt?: Date }
  ): Promise<void> {
    await this.patch(`/api/integrations/${tenantId}/${source}/run-state`, state);
  }
}
