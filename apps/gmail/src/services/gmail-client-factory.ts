import { injectable } from '@crm/shared';
import { google, gmail_v1 } from 'googleapis';
import { IntegrationClient } from '@crm/clients';
import { SecretClient } from '@crm/cloud-google';
import { logger } from '../utils/logger';

interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

/**
 * Gmail Client Factory
 *
 * Abstracts away credential strategy and returns a ready-to-use Gmail client.
 * Handles both OAuth and Service Account authentication transparently.
 *
 * Supports two modes:
 * 1. Multi-tenant: Credentials stored in database via IntegrationClient
 * 2. Personal: OAuth credentials stored in Secret Manager
 */
@injectable()
export class GmailClientFactory {
  constructor(private integrationClient: IntegrationClient) {}

  /**
   * Get Gmail API client for tenant
   * Automatically handles OAuth vs Service Account based on stored credentials
   *
   * Priority:
   * 1. Check Secret Manager for OAuth credentials (personal mode)
   * 2. Check database for tenant-specific credentials (multi-tenant mode)
   */
  async getClient(tenantId: string): Promise<gmail_v1.Gmail> {
    // Check for personal OAuth credentials in Secret Manager first
    const secretName = `gmail-oauth-${tenantId}`;
    const oauthCreds = await this.getOAuthCredentialsFromSecret(secretName);

    if (oauthCreds) {
      logger.info({ tenantId }, 'Using OAuth credentials from Secret Manager');
      return this.createOAuthClientFromSecret(oauthCreds);
    }

    // Fall back to database credentials
    const credentials = await this.integrationClient.getCredentials(tenantId, 'gmail');

    if (!credentials) {
      throw new Error(`No Gmail integration found for tenant ${tenantId}`);
    }

    // Determine auth strategy and create client
    if (credentials.serviceAccountEmail && credentials.serviceAccountKey) {
      return this.createServiceAccountClient(credentials);
    } else if (credentials.accessToken) {
      return this.createOAuthClient(tenantId, credentials);
    }

    throw new Error('Invalid credentials format - missing required fields');
  }

  /**
   * Get OAuth credentials from Secret Manager
   */
  private async getOAuthCredentialsFromSecret(secretName: string): Promise<OAuthCredentials | null> {
    try {
      const secretValue = await SecretClient.getCachedSecretValue(secretName);
      if (!secretValue) {
        return null;
      }
      return JSON.parse(secretValue) as OAuthCredentials;
    } catch (error: any) {
      // Secret doesn't exist, that's ok
      if (error.code === 5) { // NOT_FOUND
        return null;
      }
      logger.warn({ secretName, error: error.message }, 'Error fetching OAuth secret');
      return null;
    }
  }

  /**
   * Create OAuth client from Secret Manager credentials
   */
  private async createOAuthClientFromSecret(credentials: OAuthCredentials): Promise<gmail_v1.Gmail> {
    const auth = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      'http://localhost' // Redirect URI not needed for refresh
    );

    auth.setCredentials({
      refresh_token: credentials.refresh_token,
    });

    return google.gmail({ version: 'v1', auth });
  }

  /**
   * Create OAuth-authenticated Gmail client
   * Handles automatic token refresh if needed
   */
  private async createOAuthClient(tenantId: string, credentials: any): Promise<gmail_v1.Gmail> {
    // Check if token needs refresh
    const integration = await this.integrationClient.getByTenantAndSource(tenantId, 'gmail');

    if (!integration) {
      throw new Error(`Integration not found for tenant ${tenantId}`);
    }

    const tokenExpiresAt = integration.tokenExpiresAt ? new Date(integration.tokenExpiresAt) : null;
    const now = new Date();

    let accessToken = credentials.accessToken;

    // Refresh if token expires in less than 5 minutes
    if (tokenExpiresAt && tokenExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      logger.info({ tenantId }, 'Access token expiring soon, refreshing');
      accessToken = await this.refreshOAuthToken(tenantId, credentials);
    }

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

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
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

    // Update credentials via API
    await this.integrationClient.updateKeys(tenantId, 'gmail', {
      accessToken: data.access_token,
    });

    await this.integrationClient.updateTokenExpiration(
      tenantId,
      'gmail',
      new Date(Date.now() + data.expires_in * 1000)
    );

    logger.info({ tenantId }, 'OAuth token refreshed successfully');

    return data.access_token;
  }
}
