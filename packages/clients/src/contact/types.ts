import { z } from 'zod';

/**
 * Zod schema for creating/updating a contact
 * Used for validation at API boundaries
 */
export const createContactRequestSchema = z.object({
  tenantId: z.uuid(),
  companyId: z.uuid().optional(),
  email: z.string().email().max(500),
  name: z.string().optional(),
  title: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
});

export type CreateContactRequest = z.infer<typeof createContactRequestSchema>;

/**
 * Zod schema for Contact response
 */
export const contactSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  companyId: z.uuid().nullable().optional(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Contact = z.infer<typeof contactSchema>;
