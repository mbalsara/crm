import { Hono } from 'hono';
import { container } from '@crm/shared';
import { IntegrationService } from './service';
import type { IntegrationSource } from './schema';
import { updateRunStateSchema } from '@crm/clients';
import type { TokenData } from './repository';
import { logger } from '../utils/logger';

const app = new Hono();

// Helper to validate integration source
function isValidSource(source: string): source is IntegrationSource {
  return ['gmail', 'outlook', 'slack', 'other'].includes(source);
}

/**
 * Create or update integration
 */
app.post('/', async (c) => {
  const body = await c.req.json();
  const { tenantId, authType, keys } = body;

  if (!tenantId || !authType || !keys) {
    return c.json({ error: 'tenantId, authType, and keys are required' }, 400);
  }

  const integrationService = container.resolve(IntegrationService);

  try {
    const result = await integrationService.createOrUpdate({ tenantId, authType, keys });
    return c.json(result);
  } catch (error: any) {
    logger.error({ error }, 'Failed to create/update integration');
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Find tenant by email (for webhook lookup)
 * IMPORTANT: This must come BEFORE /:tenantId/:source to avoid route conflicts
 */
app.get('/lookup/by-email', async (c) => {
  const email = c.req.query('email');
  const sourceParam = c.req.query('source');
  const source = (sourceParam || 'gmail') as string;

  if (!email) {
    return c.json({ error: 'email query parameter is required' }, 400);
  }

  if (!isValidSource(source)) {
    return c.json({ error: 'Invalid source' }, 400);
  }

  const integrationService = container.resolve(IntegrationService);
  const tenantId = await integrationService.findTenantByEmail(email, source);

  if (!tenantId) {
    logger.info({ email, source }, 'No tenant found for email address');
    return c.json({ error: 'No tenant found for email' }, 404);
  }

  // Return in ApiResponse format expected by IntegrationClient
  return c.json({ data: { tenantId }, email, source });
});

/**
 * Get integration credentials (decrypted) - Internal use only
 */
app.get('/:tenantId/:source/credentials', async (c) => {
  const tenantId = c.req.param('tenantId');
  const source = c.req.param('source');

  if (!isValidSource(source)) {
    return c.json({ error: 'Invalid source' }, 400);
  }

  const integrationService = container.resolve(IntegrationService);
  const credentials = await integrationService.getCredentials(tenantId, source);

  if (!credentials) {
    return c.json({ error: 'Integration not found' }, 404);
  }

  // Return in ApiResponse format expected by IntegrationClient
  return c.json({ data: credentials });
});

/**
 * Get integration metadata (without exposing keys)
 */
app.get('/:tenantId/:source', async (c) => {
  const tenantId = c.req.param('tenantId');
  const source = c.req.param('source');

  if (!isValidSource(source)) {
    return c.json({ error: 'Invalid source' }, 400);
  }

  const integrationService = container.resolve(IntegrationService);
  const integration = await integrationService.getIntegration(tenantId, source);

  if (!integration) {
    return c.json({ error: 'Integration not found' }, 404);
  }

  // Return in ApiResponse format expected by IntegrationClient
  return c.json({ data: integration });
});

/**
 * Update token expiration (for OAuth refresh)
 */
app.put('/:tenantId/:source/token-expiration', async (c) => {
  const tenantId = c.req.param('tenantId');
  const source = c.req.param('source');
  const { expiresAt } = await c.req.json();

  if (!isValidSource(source)) {
    return c.json({ error: 'Invalid source' }, 400);
  }

  if (!expiresAt) {
    return c.json({ error: 'expiresAt is required' }, 400);
  }

  const integrationService = container.resolve(IntegrationService);

  try {
    await integrationService.updateTokenExpiration(tenantId, source, new Date(expiresAt));
    return c.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, 'Failed to update token expiration');
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Update refresh token (for OAuth re-authorization)
 */
app.put('/:tenantId/:source/refresh-token', async (c) => {
  const tenantId = c.req.param('tenantId');
  const source = c.req.param('source');
  const { refreshToken } = await c.req.json();

  if (!isValidSource(source)) {
    return c.json({ error: 'Invalid source' }, 400);
  }

  if (!refreshToken) {
    return c.json({ error: 'refreshToken is required' }, 400);
  }

  const integrationService = container.resolve(IntegrationService);

  try {
    await integrationService.updateRefreshToken(tenantId, source, refreshToken);
    logger.info({ tenantId, source }, 'Refresh token updated successfully');
    return c.json({ success: true, message: 'Refresh token updated' });
  } catch (error: any) {
    logger.error({ error, tenantId, source }, 'Failed to update refresh token');
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Update OAuth token data (refresh token + access token + expiration)
 * Stores token as JSON: { refreshToken, accessToken?, expiresAt?, tokenType? }
 * Used by Gmail service to cache access tokens in database
 */
app.put('/:tenantId/:source/token', async (c) => {
  const tenantId = c.req.param('tenantId');
  const source = c.req.param('source');
  const body = await c.req.json();

  if (!isValidSource(source)) {
    return c.json({ error: 'Invalid source' }, 400);
  }

  // Validate token data structure
  if (!body.refreshToken) {
    return c.json({ error: 'refreshToken is required' }, 400);
  }

  const integrationService = container.resolve(IntegrationService);

  try {
    const tokenData: TokenData = {
      refreshToken: body.refreshToken,
      accessToken: body.accessToken,
      expiresAt: body.expiresAt, // ISO timestamp string
      tokenType: body.tokenType || 'Bearer',
    };

    await integrationService.updateToken(tenantId, source, tokenData);
    logger.info(
      {
        tenantId,
        source,
        hasAccessToken: !!tokenData.accessToken,
        expiresAt: tokenData.expiresAt,
      },
      'Token data updated successfully'
    );
    return c.json({ success: true, message: 'Token data updated' });
  } catch (error: any) {
    logger.error(
      {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        tenantId,
        source,
      },
      'Failed to update token data'
    );
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Update integration keys (partial update)
 */
app.patch('/:tenantId/:source/keys', async (c) => {
  const tenantId = c.req.param('tenantId');
  const source = c.req.param('source');
  const { keys, updatedBy } = await c.req.json();

  if (!isValidSource(source)) {
    return c.json({ error: 'Invalid source' }, 400);
  }

  if (!keys) {
    return c.json({ error: 'keys is required' }, 400);
  }

  const integrationService = container.resolve(IntegrationService);

  try {
    const integration = await integrationService.updateKeys(tenantId, source, { keys, updatedBy });
    return c.json({ integration });
  } catch (error: any) {
    logger.error({ error }, 'Failed to update keys');
    return c.json({ error: error.message }, 500);
  }
});


/**
 * List integrations for tenant
 */
app.get('/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');

  const integrationService = container.resolve(IntegrationService);
  const integrations = await integrationService.listByTenant(tenantId);

  return c.json({ integrations });
});

/**
 * Update run state (lastRunToken, lastRunAt)
 */
app.patch('/:tenantId/:source/run-state', async (c) => {
  const tenantId = c.req.param('tenantId');
  const source = c.req.param('source');
  const body = await c.req.json();

  if (!isValidSource(source)) {
    return c.json({ error: 'Invalid source' }, 400);
  }

  const integrationService = container.resolve(IntegrationService);

  try {
    // Validate and coerce data using Zod schema from client package
    // This automatically converts date strings to Date objects and validates all fields
    // Both client and server use the same schema for consistency
    const state = updateRunStateSchema.parse(body);

    await integrationService.updateRunState(tenantId, source, state);
    return c.json({ success: true });
  } catch (error: any) {
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      logger.error({
        errors: error.errors,
        tenantId,
        source,
        body,
      }, 'Invalid run state update request');
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }

    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
      },
      tenantId,
      source,
      body,
    }, 'Failed to update run state');
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Deactivate integration
 */
app.delete('/:tenantId/:source', async (c) => {
  const tenantId = c.req.param('tenantId');
  const source = c.req.param('source');
  const { updatedBy } = await c.req.json().catch(() => ({}));

  if (!isValidSource(source)) {
    return c.json({ error: 'Invalid source' }, 400);
  }

  const integrationService = container.resolve(IntegrationService);
  await integrationService.deactivate(tenantId, source, updatedBy);

  return c.json({ message: 'Integration deactivated', tenantId, source });
});

export default app;
