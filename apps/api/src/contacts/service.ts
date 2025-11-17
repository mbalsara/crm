import { injectable, inject } from '@crm/shared';
import { ContactRepository } from './repository';
import { Logger } from '@crm/shared';
import type { Contact, NewContact } from './schema';

@injectable()
export class ContactService {
  constructor(
    private contactRepository: ContactRepository,
    @inject('Logger') private logger: Logger
  ) {}

  async getContactByEmail(tenantId: string, email: string): Promise<Contact | undefined> {
    try {
      this.logger.info(`Fetching contact by email: ${email} for tenant: ${tenantId}`);
      return await this.contactRepository.findByEmail(tenantId, email);
    } catch (error: any) {
      this.logger.error(`Failed to fetch contact by email: ${email} for tenant: ${tenantId}`, error);
      throw error;
    }
  }

  async getContactById(id: string): Promise<Contact | undefined> {
    try {
      this.logger.info(`Fetching contact by id: ${id}`);
      return await this.contactRepository.findById(id);
    } catch (error: any) {
      this.logger.error(`Failed to fetch contact by id: ${id}`, error);
      throw error;
    }
  }

  async getContactsByTenant(tenantId: string): Promise<Contact[]> {
    try {
      this.logger.info(`Fetching contacts by tenant: ${tenantId}`);
      return await this.contactRepository.findByTenantId(tenantId);
    } catch (error: any) {
      this.logger.error(`Failed to fetch contacts by tenant: ${tenantId}`, error);
      throw error;
    }
  }

  async getContactsByCompany(companyId: string): Promise<Contact[]> {
    try {
      this.logger.info(`Fetching contacts by company: ${companyId}`);
      return await this.contactRepository.findByCompanyId(companyId);
    } catch (error: any) {
      this.logger.error(`Failed to fetch contacts by company: ${companyId}`, error);
      throw error;
    }
  }

  async createContact(data: NewContact): Promise<Contact> {
    try {
      this.logger.info(`Creating contact: ${data.email} for tenant: ${data.tenantId}`);
      return await this.contactRepository.create(data);
    } catch (error: any) {
      this.logger.error(`Failed to create contact: ${data.email} for tenant: ${data.tenantId}`, error);
      throw error;
    }
  }

  async upsertContact(data: NewContact): Promise<Contact> {
    try {
      this.logger.info(`Upserting contact: ${data.email} for tenant: ${data.tenantId}`);
      return await this.contactRepository.upsert(data);
    } catch (error: any) {
      this.logger.error(`Failed to upsert contact: ${data.email} for tenant: ${data.tenantId}`, error);
      throw error;
    }
  }

  async updateContact(id: string, data: Partial<NewContact>): Promise<Contact | undefined> {
    try {
      this.logger.info(`Updating contact: ${id}`);
      return await this.contactRepository.update(id, data);
    } catch (error: any) {
      this.logger.error(`Failed to update contact: ${id}`, error);
      throw error;
    }
  }
}
