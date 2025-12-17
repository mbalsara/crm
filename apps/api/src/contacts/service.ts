import { injectable, inject } from 'tsyringe';
import { ContactRepository } from './repository';
import { logger } from '../utils/logger';
import type { Contact, NewContact } from './schema';

@injectable()
export class ContactService {
  constructor(
    @inject(ContactRepository) private contactRepository: ContactRepository
  ) {}

  async getContactByEmail(tenantId: string, email: string): Promise<Contact | undefined> {
    try {
      logger.info({ email, tenantId }, 'Fetching contact by email');
      return await this.contactRepository.findByEmail(tenantId, email);
    } catch (error: any) {
      logger.error({ error, email, tenantId }, 'Failed to fetch contact by email');
      throw error;
    }
  }

  async getContactById(id: string): Promise<Contact | undefined> {
    try {
      logger.info({ id }, 'Fetching contact by id');
      return await this.contactRepository.findById(id);
    } catch (error: any) {
      logger.error({ error, id }, 'Failed to fetch contact by id');
      throw error;
    }
  }

  async getContactsByTenant(tenantId: string): Promise<Contact[]> {
    try {
      logger.info({ tenantId }, 'Fetching contacts by tenant');
      return await this.contactRepository.findByTenantId(tenantId);
    } catch (error: any) {
      logger.error({ error, tenantId }, 'Failed to fetch contacts by tenant');
      throw error;
    }
  }

  async getContactsByCustomer(customerId: string): Promise<Contact[]> {
    try {
      logger.info({ customerId }, 'Fetching contacts by customer');
      return await this.contactRepository.findByCustomerId(customerId);
    } catch (error: any) {
      logger.error({ error, customerId }, 'Failed to fetch contacts by customer');
      throw error;
    }
  }

  async createContact(data: NewContact): Promise<Contact> {
    try {
      logger.info({ email: data.email, tenantId: data.tenantId }, 'Creating contact');
      return await this.contactRepository.create(data);
    } catch (error: any) {
      logger.error({ error, email: data.email, tenantId: data.tenantId }, 'Failed to create contact');
      throw error;
    }
  }

  async upsertContact(data: NewContact): Promise<Contact> {
    try {
      logger.info({ email: data.email, tenantId: data.tenantId }, 'Upserting contact');
      return await this.contactRepository.upsert(data);
    } catch (error: any) {
      logger.error({ error, email: data.email, tenantId: data.tenantId }, 'Failed to upsert contact');
      throw error;
    }
  }

  async updateContact(id: string, data: Partial<NewContact>): Promise<Contact | undefined> {
    try {
      logger.info({ id }, 'Updating contact');
      return await this.contactRepository.update(id, data);
    } catch (error: any) {
      logger.error({ error, id }, 'Failed to update contact');
      throw error;
    }
  }
}
