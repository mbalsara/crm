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
export class GmailClientFactory {
  constructor(private integrationClient: IntegrationClient) { }

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

    // Check if we have a cached token that's still valid (5 minute buffer)
    const cached = tokenCache.get(tenantId);
    if (cached && cached.expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
      logger.info({ tenantId, expiresAt: cached.expiresAt }, 'Using cached access token');
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: cached.accessToken });
      return google.gmail({ version: 'v1', auth });
    }

    // Check if we have a valid access token in database (not expired)
    if (credentials.accessToken && credentials.accessTokenExpiresAt) {
      const expiresAt = new Date(credentials.accessTokenExpiresAt);
      // Check if token expires in more than 5 minutes
      if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
        logger.info({ tenantId, expiresAt }, 'Using access token from database');
        
        // Cache it for faster access
        tokenCache.set(tenantId, {
          accessToken: credentials.accessToken,
          expiresAt,
        });

        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: credentials.accessToken });
        return google.gmail({ version: 'v1', auth });
      }
    }

    // Need to refresh token
    logger.info({ tenantId }, 'Access token expired or missing, refreshing');
    const { accessToken, expiresAt } = await this.refreshOAuthToken(tenantId, credentials);

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
   * Returns both access token and expiration time
   */
  private async refreshOAuthToken(
    tenantId: string,
    credentials: any
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    logger.info({ tenantId }, 'Refreshing OAuth access token');

    // Use credentials from database (not environment variables)
    const clientId = credentials.clientId;
    const clientSecret = credentials.clientSecret;
    const refreshToken = credentials.refreshToken;

    if (!clientId || !clientSecret) {
      throw new Error('clientId and clientSecret must be set in integration credentials');
    }

    if (!refreshToken) {
      throw new Error('refreshToken is required to refresh access token');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
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

    // Cache the access token in memory
    tokenCache.set(tenantId, {
      accessToken: data.access_token,
      expiresAt,
    });

    // Update access token in database (stores both accessToken and refreshToken separately)
    await this.integrationClient.updateAccessToken(tenantId, 'gmail', {
      accessToken: data.access_token,
      accessTokenExpiresAt: expiresAt,
      // Refresh token might change, but usually stays the same
      // Only update if provided in response
      refreshToken: data.refresh_token,
    });

    logger.info({ tenantId, expiresAt }, 'OAuth token refreshed and stored in database');

    return {
      accessToken: data.access_token,
      expiresAt,
    };
  }
}
