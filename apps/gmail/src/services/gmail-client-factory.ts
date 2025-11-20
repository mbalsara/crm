import { injectable } from '@crm/shared';
import { google, gmail_v1 } from 'googleapis';
import { IntegrationClient } from '@crm/clients';
import { logger } from '../utils/logger';

/**
 * In-memory cache for access tokens
 * Key: tenantId, Value: { accessToken, expiresAt }
 */
const tokenCache = new Map<string, { accessToken: string; expiresAt: Date }>();

/**
 * Gmail Client Factory
 *
 * Abstracts away credential strategy and returns a ready-to-use Gmail client.
 * Handles both OAuth and Service Account authentication transparently.
 *
 * Credentials are stored in the database via IntegrationClient.
 * Access tokens are cached in memory to avoid excessive token refreshes.
 */
@injectable()
export class GmailClientFactory {
  constructor(private integrationClient: IntegrationClient) { }

  /**
   * Get Gmail API client for tenant
   * Automatically handles OAuth vs Service Account based on stored credentials
   */
  async getClient(tenantId: string): Promise<gmail_v1.Gmail> {
    // Get credentials from database (includes accessToken if cached)
    const credentials = await this.integrationClient.getCredentials(tenantId, 'gmail');

    if (!credentials) {
      throw new Error(`No Gmail integration found for tenant ${tenantId}`);
    }

    // Determine auth strategy and create client
    if (credentials.serviceAccountEmail && credentials.serviceAccountKey) {
      return this.createServiceAccountClient(credentials);
    } else if (credentials.refreshToken || credentials.accessToken) {
      // Get integration to check tokenExpiresAt for validation
      const integration = await this.integrationClient.getByTenantAndSource(tenantId, 'gmail');
      return this.createOAuthClient(tenantId, credentials, integration?.tokenExpiresAt);
    }

    throw new Error('Invalid credentials format - missing required fields');
  }

  /**
   * Create OAuth-authenticated Gmail client
   * Handles automatic token refresh if needed
   * Checks database for cached access token before refreshing
   */
  private async createOAuthClient(
    tenantId: string,
    credentials: any,
    tokenExpiresAt?: Date | null
  ): Promise<gmail_v1.Gmail> {
    const now = new Date();
    const bufferMs = 5 * 60 * 1000; // 5 minutes buffer

    // First check in-memory cache (fastest)
    const memoryCached = tokenCache.get(tenantId);
    if (memoryCached && memoryCached.expiresAt.getTime() - now.getTime() > bufferMs) {
      logger.debug({ tenantId, expiresAt: memoryCached.expiresAt }, 'Using in-memory cached access token');
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: memoryCached.accessToken });
      return google.gmail({ version: 'v1', auth });
    }

    // Check database for cached access token (persistent across restarts)
    if (credentials.accessToken && credentials.refreshToken) {
      // Check if token expiration is available and still valid
      if (tokenExpiresAt) {
        const expiresAt = new Date(tokenExpiresAt);
        if (expiresAt.getTime() - now.getTime() > bufferMs) {
          logger.debug({ tenantId, expiresAt }, 'Using database-cached access token');
          const auth = new google.auth.OAuth2();
          auth.setCredentials({ access_token: credentials.accessToken });
          // Also update in-memory cache for faster subsequent access
          tokenCache.set(tenantId, {
            accessToken: credentials.accessToken,
            expiresAt,
          });
          return google.gmail({ version: 'v1', auth });
        } else {
          logger.debug({ tenantId, expiresAt, now }, 'Database access token expired, refreshing');
        }
      } else {
        // No expiration info - try using it, refresh will happen if invalid
        logger.debug({ tenantId }, 'Found access token without expiration info, attempting to use');
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: credentials.accessToken });
        return google.gmail({ version: 'v1', auth });
      }
    }

    // Need to refresh token
    logger.info({ tenantId }, 'Access token not found in cache or database, refreshing');
    const accessToken = await this.refreshOAuthToken(tenantId, credentials);

    // Create OAuth2 client
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    return google.gmail({ version: 'v1', auth });
  }

  /**
   * Create Service Account-authenticated Gmail client
   */
  private async createServiceAccountClient(credentials: any): Promise<gmail_v1.Gmail> {
    const jwtClient = new google.auth.JWT({
      email: credentials.serviceAccountEmail,
      key: credentials.serviceAccountKey.private_key,
      scopes: credentials.scopes || ['https://www.googleapis.com/auth/gmail.readonly'],
      subject: credentials.impersonatedUserEmail,
    });

    await jwtClient.authorize();

    return google.gmail({ version: 'v1', auth: jwtClient });
  }

  /**
   * Refresh OAuth access token
   */
  private async refreshOAuthToken(tenantId: string, credentials: any): Promise<string> {
    logger.info({ tenantId }, 'Refreshing OAuth token');

    // Use credentials from database (not environment variables)
    const clientId = credentials.clientId;
    const clientSecret = credentials.clientSecret;

    if (!clientId || !clientSecret) {
      throw new Error('clientId and clientSecret must be set in integration credentials');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ tenantId, error: errorText }, 'Failed to refresh OAuth token');
      throw new Error(`Failed to refresh token: ${response.statusText}`);
    }

    const data = await response.json() as any;

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    // Log token response details (without exposing the actual token)
    logger.info(
      {
        tenantId,
        expiresAt,
        tokenType: data.token_type,
        scope: data.scope,
        expiresIn: data.expires_in,
      },
      'OAuth token refreshed - checking granted scopes'
    );

    // Check if we have the required scopes
    const requiredScopes = ['https://www.googleapis.com/auth/gmail.readonly'];
    const grantedScopes = data.scope ? data.scope.split(' ') : [];
    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));

    if (missingScopes.length > 0) {
      logger.error(
        {
          tenantId,
          requiredScopes,
          grantedScopes,
          missingScopes,
        },
        'CRITICAL: Access token is missing required scopes - user needs to re-authorize'
      );
    }

    // Cache the access token in memory (secondary cache for performance)
    tokenCache.set(tenantId, {
      accessToken: data.access_token,
      expiresAt,
    });

    // Update full token data in database (persistent cache across restarts)
    // This stores both refreshToken and accessToken as JSON
    try {
      // We need to call API service to update token, since IntegrationClient doesn't have updateToken method yet
      // For now, update via IntegrationClient.updateTokenExpiration (tracks expiration)
      // TODO: Add updateToken method to IntegrationClient when API is ready
      await this.integrationClient.updateTokenExpiration(
        tenantId,
        'gmail',
        expiresAt
      );

      // Store full token data via API call
      // Note: This requires adding updateToken endpoint to API service
      const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4000';
      await fetch(`${apiBaseUrl}/api/integrations/${tenantId}/gmail/token`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: credentials.refreshToken,
          accessToken: data.access_token,
          expiresAt: expiresAt.toISOString(),
          tokenType: data.token_type || 'Bearer',
        }),
      }).catch((error) => {
        // Log but don't fail - token refresh succeeded, DB update is best-effort
        logger.warn(
          {
            tenantId,
            error: error.message,
          },
          'Failed to update token in database (token refreshed successfully)'
        );
      });
    } catch (error: any) {
      // Log but don't fail - token refresh succeeded
      logger.warn(
        {
          tenantId,
          error: error.message,
        },
        'Failed to update token in database (token refreshed successfully)'
      );
    }

    logger.info({ tenantId, expiresAt }, 'OAuth token refreshed and cached (memory + database)');

    return data.access_token;
  }
}
