import { z } from 'zod';

/**
 * Zod schema for Role response
 */
export const roleResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  permissions: z.array(z.number()), // Array of permission integers
  isSystem: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type RoleResponse = z.infer<typeof roleResponseSchema>;

/**
 * Zod schema for creating a role
 */
export const createRoleRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(z.number().int().min(1).max(100)).default([]),
});

export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

/**
 * Zod schema for updating a role
 */
export const updateRoleRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  permissions: z.array(z.number().int().min(1).max(100)).optional(),
});

export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;
