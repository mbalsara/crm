import { BaseClient } from '../base-client';
import type { ApiResponse } from '@crm/shared';
import type { Integration, IntegrationCredentials, IntegrationSource, IntegrationKeys } from './types';

/**
 * Client for integration-related API operations
 */
export class IntegrationClient extends BaseClient {
  /**
   * Get integration credentials (decrypted)
   */
  async getCredentials(tenantId: string, source: string): Promise<IntegrationCredentials | null> {
    const response = await this.get<ApiResponse<IntegrationCredentials>>(
      `/api/integrations/${tenantId}/${source}/credentials`
    );
    return response?.data ?? null;
  }

  /**
   * Get integration details
   */
  async getByTenantAndSource(tenantId: string, source: string): Promise<Integration | null> {
    const response = await this.get<ApiResponse<Integration>>(`/api/integrations/${tenantId}/${source}`);
    return response?.data ?? null;
  }

  /**
   * Update integration keys (re-encrypts)
   */
  async updateKeys(tenantId: string, source: string, keys: IntegrationKeys): Promise<void> {
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
  async findTenantByEmail(email: string, source: IntegrationSource = 'gmail'): Promise<string | null> {
    const response = await this.get<ApiResponse<{ tenantId: string }>>(
      `/api/integrations/lookup/by-email?email=${encodeURIComponent(email)}&source=${source}`
    );
    return response?.data?.tenantId ?? null;
  }

  /**
   * Update run state (lastRunToken, lastRunAt)
   */
  async updateRunState(
    tenantId: string,
    source: IntegrationSource,
    state: { lastRunToken?: string; lastRunAt?: Date }
  ): Promise<void> {
    await this.patch(`/api/integrations/${tenantId}/${source}/run-state`, state);
  }

  /**
   * Update access token after refresh
   */
  async updateAccessToken(
    tenantId: string,
    source: IntegrationSource,
    data: {
      accessToken: string;
      accessTokenExpiresAt: Date;
      refreshToken?: string; // Optional, in case it changes
    }
  ): Promise<void> {
    await this.patch(`/api/integrations/${tenantId}/${source}/access-token`, {
      accessToken: data.accessToken,
      accessTokenExpiresAt: data.accessTokenExpiresAt.toISOString(),
      refreshToken: data.refreshToken,
    });
  }

  /**
   * Update watch expiry timestamps
   */
  async updateWatchExpiry(
    tenantId: string,
    source: IntegrationSource,
    data: {
      watchSetAt: Date;
      watchExpiresAt: Date;
    }
  ): Promise<void> {
    await this.patch(`/api/integrations/${tenantId}/${source}/watch-expiry`, {
      watchSetAt: data.watchSetAt.toISOString(),
      watchExpiresAt: data.watchExpiresAt.toISOString(),
    });
  }

  /**
   * Check if watch needs renewal (helper method)
   */
  async needsWatchRenewal(tenantId: string, source: IntegrationSource): Promise<boolean> {
    const integration = await this.getByTenantAndSource(tenantId, source);
    if (!integration || !integration.watchExpiresAt) {
      return true; // No watch set, needs renewal
    }
    
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return integration.watchExpiresAt < oneDayFromNow;
  }
}
