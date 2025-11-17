import { injectable, inject } from '@crm/shared';
import type { Database } from '@crm/database';
import { integrations, type IntegrationSource, type IntegrationParameters } from './schema';
import { eq, and, or, sql } from 'drizzle-orm';

export interface IntegrationKeys {
  // Email being monitored/synced (for tenant lookup)
  email?: string;

  // OAuth credentials
  accessToken?: string;
  refreshToken?: string;

  // OAuth client credentials (non-token)
  clientId?: string;
  clientSecret?: string;

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

/**
 * Convert key-value array to object
 */
function parametersToObject(params: IntegrationParameters): Record<string, string> {
  return params.reduce((acc: Record<string, string>, { key, value }: { key: string; value: string }) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
}

/**
 * Convert object to key-value array
 */
function objectToParameters(obj: Record<string, any>): IntegrationParameters {
  return Object.entries(obj).map(([key, value]: [string, any]) => ({
    key,
    value: String(value),
  }));
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
   * Create a new integration
   */
  async create(input: CreateIntegrationInput) {
    // Separate token from other parameters
    const { refreshToken, accessToken, ...params } = input.keys;

    // Convert params object to key-value array for JSONB storage
    const parametersArray = objectToParameters(params);

    const result = await this.db
      .insert(integrations)
      .values({
        tenantId: input.tenantId,
        source: input.source,
        authType: input.authType,
        parameters: parametersArray,
        token: refreshToken,
        tokenExpiresAt: input.tokenExpiresAt,
        createdBy: input.createdBy,
        isActive: true,
      })
      .returning();

    return this.mapToIntegration(result[0]);
  }

  /**
   * Get integration credentials
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

    // Convert parameters array to object
    const params = parametersToObject(integration.parameters as IntegrationParameters);

    return {
      ...params,
      refreshToken: integration.token || undefined,
    };
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
   * Update integration keys
   */
  async updateKeys(tenantId: string, source: IntegrationSource, input: UpdateKeysInput) {
    // Get current keys
    const current = await this.getCredentials(tenantId, source);

    if (!current) {
      throw new Error(`Integration not found for tenant ${tenantId} and source ${source}`);
    }

    // Merge with new keys
    const updatedKeys = { ...current, ...input.keys };

    // Separate token from other parameters
    const { refreshToken, accessToken, ...params } = updatedKeys;

    // Convert params to key-value array
    const parametersArray = objectToParameters(params);

    const result = await this.db
      .update(integrations)
      .set({
        parameters: parametersArray,
        token: refreshToken,
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
   * Searches in integration parameters for impersonatedUserEmail or any email field
   */
  async findTenantByEmail(email: string, source: IntegrationSource = 'gmail'): Promise<string | null> {
    const result = await this.db
      .select({ tenantId: integrations.tenantId, parameters: integrations.parameters })
      .from(integrations)
      .where(and(eq(integrations.source, source), eq(integrations.isActive, true)));

    // Search for matching email in parameters
    for (const row of result) {
      try {
        const params = parametersToObject(row.parameters as IntegrationParameters);

        // Check various email fields
        if (
          params.impersonatedUserEmail === email ||
          params.email === email ||
          params.userEmail === email
        ) {
          return row.tenantId;
        }
      } catch (error) {
        console.error('Failed to parse integration parameters:', error);
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
    // Convert parameters array to object
    const params = parametersToObject(row.parameters as IntegrationParameters);

    return {
      ...row,
      keys: {
        ...params,
        refreshToken: row.token || undefined,
      },
    };
  }
}
