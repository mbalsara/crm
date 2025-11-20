import { injectable } from '@crm/shared';
import { IntegrationRepository, type CreateIntegrationInput, type UpdateKeysInput, type IntegrationKeys, type TokenData } from './repository';
import type { IntegrationSource } from './schema';
import type { UpdateRunState } from '@crm/clients';
import { logger } from '../utils/logger';

@injectable()
export class IntegrationService {
  constructor(private integrationRepo: IntegrationRepository) {}

  /**
   * Create or update integration
   */
  async createOrUpdate(input: {
    tenantId: string;
    authType: 'oauth' | 'service_account' | 'api_key';
    keys: IntegrationKeys;
  }) {
    const { tenantId, authType, keys } = input;

    // Validate that email is set for lookup
    if (!keys.email && !keys.impersonatedUserEmail) {
      throw new Error('keys.email or keys.impersonatedUserEmail is required for tenant lookup');
    }

    const exists = await this.integrationRepo.exists(tenantId, 'gmail');

    if (exists) {
      logger.info({ tenantId }, 'Updating existing Gmail integration');
      const integration = await this.integrationRepo.updateKeys(tenantId, 'gmail', { keys });
      return { integration, updated: true };
    } else {
      logger.info({ tenantId, authType }, 'Creating new Gmail integration');
      const integration = await this.integrationRepo.create({
        tenantId,
        source: 'gmail',
        authType,
        keys,
        tokenExpiresAt: keys.expiresAt ? new Date(keys.expiresAt) : undefined,
      });
      return { integration, created: true };
    }
  }

  /**
   * Get integration credentials (decrypted) - Internal use only
   */
  async getCredentials(tenantId: string, source: IntegrationSource): Promise<IntegrationKeys | null> {
    return this.integrationRepo.getCredentials(tenantId, source);
  }

  /**
   * Get integration metadata (without exposing keys)
   */
  async getIntegration(tenantId: string, source: IntegrationSource) {
    const integration = await this.integrationRepo.getIntegration(tenantId, source);

    if (!integration) {
      return null;
    }

    // Don't expose sensitive keys
    return {
      id: integration.id,
      tenantId: integration.tenantId,
      source: integration.source,
      authType: integration.authType,
      isActive: integration.isActive,
      tokenExpiresAt: integration.tokenExpiresAt,
      lastUsedAt: integration.lastUsedAt,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }

  /**
   * Update token expiration (for OAuth refresh)
   */
  async updateTokenExpiration(tenantId: string, source: IntegrationSource, expiresAt: Date) {
    await this.integrationRepo.updateTokenExpiration(tenantId, source, expiresAt);
  }

  /**
   * Update refresh token (for OAuth re-authorization)
   * @deprecated Use updateToken() instead to store full token data
   */
  async updateRefreshToken(tenantId: string, source: IntegrationSource, refreshToken: string) {
    await this.integrationRepo.updateRefreshToken(tenantId, source, refreshToken);
  }

  /**
   * Update OAuth token data (refresh token + access token + expiration)
   * Stores token as JSON in database for persistence across service restarts
   */
  async updateToken(tenantId: string, source: IntegrationSource, tokenData: TokenData): Promise<void> {
    await this.integrationRepo.updateToken(tenantId, source, tokenData);
  }

  /**
   * Update integration keys (partial update)
   */
  async updateKeys(tenantId: string, source: IntegrationSource, input: UpdateKeysInput) {
    return this.integrationRepo.updateKeys(tenantId, source, input);
  }

  /**
   * Find tenant by email (for webhook lookup)
   */
  async findTenantByEmail(email: string, source: IntegrationSource = 'gmail'): Promise<string | null> {
    return this.integrationRepo.findTenantByEmail(email, source);
  }

  /**
   * List integrations for tenant
   */
  async listByTenant(tenantId: string) {
    return this.integrationRepo.listByTenant(tenantId);
  }

  /**
   * Update run state (lastRunToken, lastRunAt)
   * Accepts UpdateRunState (from Zod schema) which has Date objects (coerced from strings)
   */
  async updateRunState(
    tenantId: string,
    source: IntegrationSource,
    state: UpdateRunState
  ) {
    // UpdateRunState has Date objects (from Zod coercion), repository expects Date objects
    await this.integrationRepo.updateRunState(tenantId, source, state);
  }

  /**
   * Deactivate integration
   */
  async deactivate(tenantId: string, source: IntegrationSource, updatedBy?: string) {
    logger.warn({ tenantId, source }, 'Deactivating integration');
    await this.integrationRepo.deactivate(tenantId, source, updatedBy);
  }
}
