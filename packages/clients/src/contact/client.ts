import { BaseClient } from '../base-client';
import type { ApiResponse, SearchRequest, SearchResponse } from '@crm/shared';
import type { Contact, CreateContactRequest } from './types';

/**
 * Client for contact-related API operations
 */
export class ContactClient extends BaseClient {
  /**
   * Create or update a contact
   */
  async upsertContact(data: CreateContactRequest, signal?: AbortSignal): Promise<Contact> {
    const response = await this.post<ApiResponse<Contact>>('/api/contacts', data, signal);
    if (!response || !response.data) {
      throw new Error('Invalid API response: missing data');
    }
    return response.data;
  }

  /**
   * Get contact by email
   */
  async getContactByEmail(tenantId: string, email: string, signal?: AbortSignal): Promise<Contact | null> {
    const encodedEmail = encodeURIComponent(email);
    const response = await this.get<ApiResponse<Contact>>(`/api/contacts/email/${tenantId}/${encodedEmail}`, signal);
    return response?.data || null;
  }

  /**
   * Get contact by ID
   */
  async getContactById(id: string, signal?: AbortSignal): Promise<Contact | null> {
    const response = await this.get<ApiResponse<Contact>>(`/api/contacts/${id}`, signal);
    return response?.data || null;
  }

  /**
   * Get all contacts for a tenant
   */
  async getContactsByTenant(tenantId: string, signal?: AbortSignal): Promise<Contact[]> {
    const response = await this.get<ApiResponse<Contact[]>>(`/api/contacts/tenant/${tenantId}`, signal);
    return response?.data || [];
  }

  /**
   * Update a contact
   */
  async updateContact(id: string, data: Partial<CreateContactRequest>, signal?: AbortSignal): Promise<Contact> {
    const response = await this.patch<ApiResponse<Contact>>(`/api/contacts/${id}`, data, signal);
    if (!response || !response.data) {
      throw new Error('Invalid API response: missing data');
    }
    return response.data;
  }

  /**
   * Search contacts
   * Automatically cancels previous search requests when a new one is made
   */
  async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse<Contact>> {
    const response = await this.post<ApiResponse<SearchResponse<Contact>>>(
      '/api/contacts/search',
      request,
      signal
    );
    
    if (!response?.data) {
      throw new Error('Invalid API response: missing data');
    }
    
    return response.data;
  }
}
