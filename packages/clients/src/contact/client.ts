import { injectable } from 'tsyringe';
import { z } from 'zod';
import { BaseClient } from '../base-client';
import type { ApiResponse } from '@crm/shared';

/**
 * Zod schema for creating/updating a contact
 * Used for validation at API boundaries
 */
export const createContactRequestSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid().optional(),
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
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  companyId: z.string().uuid().nullable().optional(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Contact = z.infer<typeof contactSchema>;

/**
 * Client for contact-related API operations
 */
@injectable()
export class ContactClient extends BaseClient {
  /**
   * Create or update a contact
   */
  async upsertContact(data: CreateContactRequest): Promise<Contact> {
    const response = await this.post<ApiResponse<Contact>>('/api/contacts', data);
    if (!response || !response.data) {
      throw new Error('Invalid API response: missing data');
    }
    return response.data;
  }

  /**
   * Get contact by email
   */
  async getContactByEmail(tenantId: string, email: string): Promise<Contact | null> {
    const encodedEmail = encodeURIComponent(email);
    const response = await this.get<ApiResponse<Contact>>(`/api/contacts/email/${tenantId}/${encodedEmail}`);
    return response?.data || null;
  }

  /**
   * Get contact by ID
   */
  async getContactById(id: string): Promise<Contact | null> {
    const response = await this.get<ApiResponse<Contact>>(`/api/contacts/${id}`);
    return response?.data || null;
  }

  /**
   * Get all contacts for a tenant
   */
  async getContactsByTenant(tenantId: string): Promise<Contact[]> {
    const response = await this.get<ApiResponse<Contact[]>>(`/api/contacts/tenant/${tenantId}`);
    return response?.data || [];
  }

  /**
   * Update a contact
   */
  async updateContact(id: string, data: Partial<CreateContactRequest>): Promise<Contact> {
    const response = await this.patch<ApiResponse<Contact>>(`/api/contacts/${id}`, data);
    if (!response || !response.data) {
      throw new Error('Invalid API response: missing data');
    }
    return response.data;
  }
}
