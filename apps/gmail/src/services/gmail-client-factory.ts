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
  constructor(private integrationClient: IntegrationClient) {}

  /**
   * Get Gmail API client for tenant
   * Automatically handles OAuth vs Service Account based on stored credentials
   */
  async getClient(tenantId: string): Promise<gmail_v1.Gmail> {
    // Get credentials from database
    const credentials = await this.integrationClient.getCredentials(tenantId, 'gmail');

    if (!credentials) {
      throw new Error(`No Gmail integration found for tenant ${tenantId}`);
    }

    // Determine auth strategy and create client
    if (credentials.serviceAccountEmail && credentials.serviceAccountKey) {
      return this.createServiceAccountClient(credentials);
    } else if (credentials.refreshToken || credentials.accessToken) {
      return this.createOAuthClient(tenantId, credentials);
    }

    throw new Error('Invalid credentials format - missing required fields');
  }

  /**
   * Create OAuth-authenticated Gmail client
   * Handles automatic token refresh if needed
   */
  private async createOAuthClient(tenantId: string, credentials: any): Promise<gmail_v1.Gmail> {
    const now = new Date();

    // Check if we have a cached token that's still valid
    const cached = tokenCache.get(tenantId);
    if (cached && cached.expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
      logger.info({ tenantId, expiresAt: cached.expiresAt }, 'Using cached access token');
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: cached.accessToken });
      return google.gmail({ version: 'v1', auth });
    }

    // Need to refresh token
    logger.info({ tenantId }, 'Access token not cached or expired, refreshing');
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

    const data = await response.json();

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

    // Cache the access token in memory
    tokenCache.set(tenantId, {
      accessToken: data.access_token,
      expiresAt,
    });

    // Update token expiration in database (for tracking purposes)
    await this.integrationClient.updateTokenExpiration(
      tenantId,
      'gmail',
      expiresAt
    );

    logger.info({ tenantId, expiresAt }, 'OAuth token refreshed and cached successfully');

    return data.access_token;
  }
}
