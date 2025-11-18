import { z } from 'zod';

/**
 * Zod schema for creating/updating a company
 * Used for validation at API boundaries
 * 
 * Note: domains array is serialized to company_domains table internally
 * Physical implementation (companies + company_domains) is hidden from callers
 */
export const createCompanyRequestSchema = z.object({
  tenantId: z.uuid(),
  domains: z.array(z.string().min(1).max(255)).min(1), // At least one domain required
  name: z.string().optional(),
  website: z.string().url().optional(),
  industry: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>;

/**
 * Zod schema for Company response
 * 
 * This is the logical Company model exposed to clients.
 * Physical implementation (companies + company_domains tables) is hidden.
 */
export const companySchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  domains: z.array(z.string()), // Array of domains (serialized from company_domains table)
  name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Company = z.infer<typeof companySchema>;
