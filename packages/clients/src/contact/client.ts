import { BaseClient } from '../base-client';
import type { ApiResponse } from '@crm/shared';
import type { Contact, CreateContactRequest } from './types';

/**
 * Client for contact-related API operations
 */
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
