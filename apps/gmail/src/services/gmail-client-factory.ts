import { injectable } from '@crm/shared';
import { google, gmail_v1 } from 'googleapis';
import { IntegrationClient } from '@crm/clients';
import { logger } from '../utils/logger';

/**
 * Gmail Client Factory
 *
 * Abstracts away credential strategy and returns a ready-to-use Gmail client.
 * Handles both OAuth and Service Account authentication transparently.
 *
 * Credentials are stored in the database via IntegrationClient.
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
    // Check if token needs refresh
    const integration = await this.integrationClient.getByTenantAndSource(tenantId, 'gmail');

    if (!integration) {
      throw new Error(`Integration not found for tenant ${tenantId}`);
    }

    const tokenExpiresAt = integration.tokenExpiresAt ? new Date(integration.tokenExpiresAt) : null;
    const now = new Date();

    let accessToken = credentials.accessToken;

    // Refresh if no access token, or if token expires in less than 5 minutes
    if (!accessToken || (tokenExpiresAt && tokenExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000)) {
      logger.info({ tenantId }, !accessToken ? 'No access token, refreshing' : 'Access token expiring soon, refreshing');
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
