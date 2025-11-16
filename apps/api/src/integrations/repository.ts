import { injectable, inject, encryption } from '@crm/shared';
import type { Database } from '@crm/database';
import { integrations, type IntegrationSource } from './schema';
import { eq, and, or, sql } from 'drizzle-orm';

export interface IntegrationKeys {
  // Email being monitored/synced (for tenant lookup)
  email?: string;

  // OAuth credentials
  accessToken?: string;
  refreshToken?: string;

  // Service Account credentials
  serviceAccountEmail?: string;
  serviceAccountKey?: any;
  impersonatedUserEmail?: string;

  // API Key
  apiKey?: string;

  // Additional metadata
  scopes?: string[];
  [key: string]: any;
}

export interface CreateIntegrationInput {
  tenantId: string;
  source: IntegrationSource;
  authType: 'oauth' | 'service_account' | 'api_key';
  keys: IntegrationKeys;
  createdBy?: string;
  tokenExpiresAt?: Date;
}

export interface UpdateKeysInput {
  keys: Partial<IntegrationKeys>;
  updatedBy?: string;
}

@injectable()
export class IntegrationRepository {
  constructor(@inject('Database') private db: Database) {}

  /**
   * Create a new integration with encrypted keys
   */
  async create(input: CreateIntegrationInput) {
    const encryptedKeys = await encryption.encryptJSON(input.keys);

    const result = await this.db
      .insert(integrations)
      .values({
        tenantId: input.tenantId,
        source: input.source,
        authType: input.authType,
        keys: encryptedKeys,
        tokenExpiresAt: input.tokenExpiresAt,
        createdBy: input.createdBy,
        isActive: true,
      })
      .returning();

    return this.mapToIntegration(result[0]);
  }

  /**
   * Get integration credentials (decrypted)
   */
  async getCredentials(tenantId: string, source: IntegrationSource): Promise<IntegrationKeys | null> {
    const result = await this.db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.tenantId, tenantId),
          eq(integrations.source, source),
          eq(integrations.isActive, true)
        )
      )
      .limit(1);

    if (!result.length) {
      return null;
    }

    const integration = result[0];

    // Update last used timestamp (fire and forget)
    this.updateLastUsed(integration.id).catch((err) =>
      console.error('Failed to update lastUsedAt:', err)
    );

    return encryption.decryptJSON<IntegrationKeys>(integration.keys);
  }

  /**
   * Get integration with metadata (including token expiration)
   */
  async getIntegration(tenantId: string, source: IntegrationSource) {
    const result = await this.db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.tenantId, tenantId),
          eq(integrations.source, source),
          eq(integrations.isActive, true)
        )
      )
      .limit(1);

    if (!result.length) {
      return null;
    }

    return this.mapToIntegration(result[0]);
  }

  /**
   * Update integration keys (re-encrypts)
   */
  async updateKeys(tenantId: string, source: IntegrationSource, input: UpdateKeysInput) {
    // Get current keys
    const current = await this.getCredentials(tenantId, source);

    if (!current) {
      throw new Error(`Integration not found for tenant ${tenantId} and source ${source}`);
    }

    // Merge with new keys
    const updatedKeys = { ...current, ...input.keys };
    const encryptedKeys = await encryption.encryptJSON(updatedKeys);

    const result = await this.db
      .update(integrations)
      .set({
        keys: encryptedKeys,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      })
      .where(and(eq(integrations.tenantId, tenantId), eq(integrations.source, source)))
      .returning();

    return this.mapToIntegration(result[0]);
  }

  /**
   * Update OAuth token expiration
   */
  async updateTokenExpiration(tenantId: string, source: IntegrationSource, expiresAt: Date) {
    await this.db
      .update(integrations)
      .set({
        tokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(and(eq(integrations.tenantId, tenantId), eq(integrations.source, source)));
  }

  /**
   * Update run state (lastRunToken, lastRunAt)
   */
  async updateRunState(
    tenantId: string,
    source: IntegrationSource,
    state: {
      lastRunToken?: string;
      lastRunAt?: Date;
    }
  ) {
    await this.db
      .update(integrations)
      .set({
        ...state,
        updatedAt: new Date(),
      })
      .where(and(eq(integrations.tenantId, tenantId), eq(integrations.source, source)));
  }

  /**
   * Deactivate integration
   */
  async deactivate(tenantId: string, source: IntegrationSource, updatedBy?: string) {
    await this.db
      .update(integrations)
      .set({
        isActive: false,
        updatedBy,
        updatedAt: new Date(),
      })
      .where(and(eq(integrations.tenantId, tenantId), eq(integrations.source, source)));
  }

  /**
   * Check if integration exists and is active
   */
  async exists(tenantId: string, source: IntegrationSource): Promise<boolean> {
    const result = await this.db
      .select({ id: integrations.id })
      .from(integrations)
      .where(
        and(
          eq(integrations.tenantId, tenantId),
          eq(integrations.source, source),
          eq(integrations.isActive, true)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * List all integrations for a tenant
   */
  async listByTenant(tenantId: string) {
    const result = await this.db
      .select()
      .from(integrations)
      .where(eq(integrations.tenantId, tenantId));

    return result.map((row) => ({
      ...row,
      // Don't decrypt keys in list view for security
      keys: undefined,
    }));
  }

  /**
   * Find tenant ID by email address (for webhook lookup)
   * Searches in integration keys for impersonatedUserEmail or any email field
   */
  async findTenantByEmail(email: string, source: IntegrationSource = 'gmail'): Promise<string | null> {
    const result = await this.db
      .select({ tenantId: integrations.tenantId, keys: integrations.keys })
      .from(integrations)
      .where(and(eq(integrations.source, source), eq(integrations.isActive, true)));

    // Decrypt and search for matching email
    for (const row of result) {
      try {
        const keys = await encryption.decryptJSON<IntegrationKeys>(row.keys);

        // Check various email fields
        if (
          keys.impersonatedUserEmail === email ||
          keys.email === email ||
          (keys as any).userEmail === email
        ) {
          return row.tenantId;
        }
      } catch (error) {
        console.error('Failed to decrypt integration keys:', error);
        continue;
      }
    }

    return null;
  }

  private async updateLastUsed(integrationId: string) {
    await this.db
      .update(integrations)
      .set({ lastUsedAt: new Date() })
      .where(eq(integrations.id, integrationId));
  }

  private async mapToIntegration(row: any) {
    return {
      ...row,
      keys: await encryption.decryptJSON(row.keys),
    };
  }
}
