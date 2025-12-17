import { z } from 'zod';

/**
 * Zod schema for creating a user
 */
export const createUserRequestSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email().max(255),
  managerEmails: z.array(z.string().email()).optional().default([]),
  customerDomains: z.array(z.string().min(1)).optional().default([]),
});

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/**
 * Zod schema for updating a user
 */
export const updateUserRequestSchema = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().min(1).max(60).optional(),
  email: z.string().email().max(255).optional(),
});

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

/**
 * Zod schema for User response
 */
export const userResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  rowStatus: z.number().int().min(0).max(2), // 0=active, 1=inactive, 2=archived
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

/**
 * Zod schema for User with relations
 */
export const userWithRelationsResponseSchema = userResponseSchema.extend({
  managers: z.array(userResponseSchema).optional(),
  customerAssignments: z.array(z.object({
    userId: z.string().uuid(),
    customerId: z.string().uuid(),
    role: z.string().nullable().optional(),
    createdAt: z.coerce.date(),
  })).optional(),
});

export type UserWithRelationsResponse = z.infer<typeof userWithRelationsResponseSchema>;

/**
 * Zod schema for adding a manager
 */
export const addManagerRequestSchema = z.object({
  managerEmail: z.string().email(),
});

export type AddManagerRequest = z.infer<typeof addManagerRequestSchema>;

/**
 * Zod schema for adding a customer
 */
export const addCustomerRequestSchema = z.object({
  customerDomain: z.string().min(1),
  role: z.string().max(100).optional(),
});

export type AddCustomerRequest = z.infer<typeof addCustomerRequestSchema>;
