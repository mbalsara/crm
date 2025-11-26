import { Hono } from 'hono';
import { google } from 'googleapis';
import { container } from 'tsyringe';
import { IntegrationService } from '../integrations/service';
import { logger } from '../utils/logger';

const app = new Hono();

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

/**
 * OAuth state management (in-memory)
 * In production, consider using Redis or encrypted session tokens
 */
const oauthStates = new Map<string, {
  tenantId: string;
  createdAt: Date;
  clientId: string;
  clientSecret: string;
}>();

// Clean up old states every 10 minutes
setInterval(() => {
  const now = new Date();
  for (const [state, data] of oauthStates.entries()) {
    if (now.getTime() - data.createdAt.getTime() > 10 * 60 * 1000) {
      oauthStates.delete(state);
    }
  }
}, 10 * 60 * 1000);

/**
 * Initiate OAuth flow
 * GET /oauth/gmail/authorize?tenantId=xxx
 *
 * This generates an authorization URL and redirects the user to Google's consent screen.
 * After authorization, Google will redirect back to /oauth/gmail/callback
 */
app.get('/gmail/authorize', async (c) => {
  const tenantId = c.req.query('tenantId');
  const clientIdParam = c.req.query('clientId');
  const clientSecretParam = c.req.query('clientSecret');

  if (!tenantId) {
    return c.json({ error: 'tenantId query parameter is required' }, 400);
  }

  try {
    const integrationService = container.resolve(IntegrationService);

    let clientId: string;
    let clientSecret: string;

    // Try to get credentials from existing integration first
    const credentials = await integrationService.getCredentials(tenantId, 'gmail');

    if (credentials?.clientId && credentials?.clientSecret) {
      // Use existing credentials
      clientId = credentials.clientId;
      clientSecret = credentials.clientSecret;
      logger.info({ tenantId }, 'Using existing OAuth credentials from integration');
    } else if (clientIdParam && clientSecretParam) {
      // Use credentials from query parameters (for initial setup)
      clientId = clientIdParam;
      clientSecret = clientSecretParam;
      logger.info({ tenantId }, 'Using OAuth credentials from query parameters');
    } else {
      // Check environment variables as fallback
      clientId = process.env.GOOGLE_CLIENT_ID || '';
      clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

      if (!clientId || !clientSecret) {
        return c.json({
          error: 'OAuth credentials not found. Please provide clientId and clientSecret query parameters, or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
        }, 400);
      }

      logger.info({ tenantId }, 'Using OAuth credentials from environment variables');
    }

    // Determine redirect URI based on environment
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
    const redirectUri = `${baseUrl}/oauth/gmail/callback`;

    // Create OAuth2 client
    const oAuth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Generate state token to prevent CSRF
    const state = crypto.randomUUID();
    oauthStates.set(state, {
      tenantId,
      createdAt: new Date(),
      clientId,
      clientSecret
    });

    // Generate authorization URL
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Force consent to get refresh token
      state,
    });

    logger.info({ tenantId, redirectUri }, 'OAuth authorization initiated');

    // Redirect user to Google's consent screen
    return c.redirect(authUrl);
  } catch (error: any) {
    logger.error({ error, tenantId }, 'Failed to initiate OAuth flow');
    return c.json({ error: error.message }, 500);
  }
});

/**
 * OAuth callback endpoint
 * GET /oauth/gmail/callback?code=xxx&state=xxx
 *
 * Google redirects here after user authorizes.
 * We exchange the authorization code for tokens and save the refresh token.
 */
app.get('/gmail/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  // Handle authorization errors
  if (error) {
    logger.error({ error }, 'OAuth authorization failed');
    return c.html(`
      <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: ${error}</p>
          <p>Please try again or contact support.</p>
        </body>
      </html>
    `, 400);
  }

  if (!code || !state) {
    return c.json({ error: 'Missing code or state parameter' }, 400);
  }

  // Verify state to prevent CSRF
  const stateData = oauthStates.get(state);
  if (!stateData) {
    logger.error({ state }, 'Invalid or expired OAuth state');
    return c.json({ error: 'Invalid or expired authorization request' }, 400);
  }

  const { tenantId, clientId, clientSecret } = stateData;
  oauthStates.delete(state); // Clean up state

  try {
    const integrationService = container.resolve(IntegrationService);

    // Determine redirect URI (must match the one used in authorize)
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
    const redirectUri = `${baseUrl}/oauth/gmail/callback`;

    // Create OAuth2 client using credentials from state
    const oAuth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Exchange authorization code for tokens
    const { tokens } = await oAuth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error(
        'No refresh token received. The user may need to revoke access first: ' +
        'https://myaccount.google.com/permissions'
      );
    }

    logger.info(
      {
        tenantId,
        scope: tokens.scope,
        hasRefreshToken: !!tokens.refresh_token
      },
      'OAuth tokens received'
    );

    // Set credentials first, then get user's email from Google
    oAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const email = userInfo.email;

    if (!email) {
      throw new Error('Could not retrieve email from Google account');
    }

    logger.info({ tenantId, email }, 'Retrieved user email from Google');

    // Create or update integration based on email
    await integrationService.createOrUpdate({
      tenantId,
      authType: 'oauth',
      keys: {
        email,
        clientId,
        clientSecret,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token || undefined,
      },
    });

    logger.info({ tenantId, email }, 'OAuth integration created/updated successfully');

    // Return success page
    return c.html(`
      <html>
        <head>
          <title>Authorization Successful</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            h1 { color: #22c55e; }
            .info {
              background: #f0f9ff;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <h1>✅ Authorization Successful!</h1>
          <div class="info">
            <p><strong>Tenant ID:</strong> ${tenantId}</p>
            <p><strong>Granted Scopes:</strong></p>
            <ul style="list-style: none; padding: 0;">
              ${SCOPES.map(scope => `<li>✓ ${scope}</li>`).join('')}
            </ul>
          </div>
          <p>Your Gmail integration has been authorized successfully.</p>
          <p>You can close this window and return to your application.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    logger.error({ error, tenantId }, 'Failed to complete OAuth flow');

    return c.html(`
      <html>
        <head><title>Authorization Error</title></head>
        <body>
          <h1>Authorization Error</h1>
          <p>${error.message}</p>
          <p>Please try again or contact support.</p>
        </body>
      </html>
    `, 500);
  }
});

export default app;
