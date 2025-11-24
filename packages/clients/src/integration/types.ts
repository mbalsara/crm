import { z } from 'zod';

/**
 * Integration source types
 */
export const integrationSourceSchema = z.enum(['gmail', 'outlook', 'slack', 'other']);
export type IntegrationSource = z.infer<typeof integrationSourceSchema>;

/**
 * Integration auth types
 */
export const integrationAuthTypeSchema = z.enum(['oauth', 'service_account', 'api_key']);
export type IntegrationAuthType = z.infer<typeof integrationAuthTypeSchema>;

/**
 * Integration keys (for create/update requests)
 */
export const integrationKeysSchema = z.record(z.string(), z.any());
export type IntegrationKeys = z.infer<typeof integrationKeysSchema>;

/**
 * Zod schema for Integration response
 * Note: Sensitive fields (credentials, tokens) are not exposed in API responses
 */
export const integrationSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  source: integrationSourceSchema,
  authType: integrationAuthTypeSchema,
  isActive: z.boolean(),
  tokenExpiresAt: z.coerce.date().nullable().optional(),
  lastUsedAt: z.coerce.date().nullable().optional(),
  lastRunToken: z.string().nullable().optional(), // Gmail historyId, Outlook deltaToken, etc.
  lastRunAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Integration = z.infer<typeof integrationSchema>;

/**
 * Zod schema for Integration credentials response (decrypted)
 * Internal use only - contains sensitive data
 */
export const integrationCredentialsSchema = integrationKeysSchema;
export type IntegrationCredentials = z.infer<typeof integrationCredentialsSchema>;

/**
 * Zod schema for updating run state (lastRunToken, lastRunAt)
 * Validates and coerces date strings to Date objects
 */
export const updateRunStateSchema = z.object({
  lastRunToken: z.string().optional(),
  lastRunAt: z.coerce.date().optional(),
});

export type UpdateRunState = z.infer<typeof updateRunStateSchema>;
