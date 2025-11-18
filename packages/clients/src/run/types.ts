import { z } from 'zod';

/**
 * Run status types
 */
export const runStatusSchema = z.enum(['running', 'completed', 'failed']);
export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * Run type
 */
export const runTypeSchema = z.enum(['initial', 'incremental', 'historical', 'webhook']);
export type RunType = z.infer<typeof runTypeSchema>;

/**
 * Zod schema for creating a run
 */
export const createRunRequestSchema = z.object({
  integrationId: z.uuid(),
  tenantId: z.uuid(),
  status: runStatusSchema,
  runType: runTypeSchema,
  itemsProcessed: z.number().int().default(0).optional(),
  itemsInserted: z.number().int().default(0).optional(),
  itemsSkipped: z.number().int().default(0).optional(),
  startToken: z.string().optional(),
  endToken: z.string().optional(),
  errorMessage: z.string().optional(),
  errorStack: z.string().optional(),
  retryCount: z.number().int().default(0).optional(),
  startedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
});

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

/**
 * Zod schema for updating a run
 */
export const updateRunRequestSchema = z.object({
  status: runStatusSchema.optional(),
  completedAt: z.coerce.date().optional(),
  itemsProcessed: z.number().int().optional(),
  itemsInserted: z.number().int().optional(),
  itemsSkipped: z.number().int().optional(),
  endToken: z.string().optional(),
  errorMessage: z.string().optional(),
  errorStack: z.string().optional(),
  retryCount: z.number().int().optional(),
});

export type UpdateRunRequest = z.infer<typeof updateRunRequestSchema>;

/**
 * Zod schema for Run response
 */
export const runSchema = z.object({
  id: z.uuid(),
  integrationId: z.uuid(),
  tenantId: z.uuid(),
  status: runStatusSchema,
  runType: runTypeSchema,
  itemsProcessed: z.number().int(),
  itemsInserted: z.number().int(),
  itemsSkipped: z.number().int(),
  startToken: z.string().nullable().optional(),
  endToken: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  errorStack: z.string().nullable().optional(),
  retryCount: z.number().int(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
});

export type Run = z.infer<typeof runSchema>;
