import { injectable } from '@crm/shared';
import { CompanyRepository } from './repository';
import { logger } from '../utils/logger';
import type { Company, NewCompany } from './schema';

@injectable()
export class CompanyService {
  constructor(
    private companyRepository: CompanyRepository
  ) {}

  async getCompanyByDomain(tenantId: string, domain: string): Promise<Company | undefined> {
    try {
      logger.info({ domain, tenantId }, 'Fetching company by domain');
      return await this.companyRepository.findByDomain(tenantId, domain);
    } catch (error: any) {
      logger.error({ error, domain, tenantId }, 'Failed to fetch company by domain');
      throw error;
    }
  }

  async getCompanyById(id: string): Promise<Company | undefined> {
    try {
      logger.info({ id }, 'Fetching company by id');
      return await this.companyRepository.findById(id);
    } catch (error: any) {
      logger.error({ error, id }, 'Failed to fetch company by id');
      throw error;
    }
  }

  async getCompaniesByTenant(tenantId: string): Promise<Company[]> {
    try {
      logger.info({ tenantId }, 'Fetching companies by tenant');
      return await this.companyRepository.findByTenantId(tenantId);
    } catch (error: any) {
      logger.error({ error, tenantId }, 'Failed to fetch companies by tenant');
      throw error;
    }
  }

  async createCompany(data: NewCompany): Promise<Company> {
    try {
      logger.info({ domain: data.domain, tenantId: data.tenantId }, 'Creating company');
      return await this.companyRepository.create(data);
    } catch (error: any) {
      logger.error({ error, domain: data.domain, tenantId: data.tenantId }, 'Failed to create company');
      throw error;
    }
  }

  async upsertCompany(data: NewCompany): Promise<Company> {
    try {
      logger.info({ domain: data.domain, tenantId: data.tenantId }, 'Upserting company');
      return await this.companyRepository.upsert(data);
    } catch (error: any) {
      logger.error({ error, domain: data.domain, tenantId: data.tenantId }, 'Failed to upsert company');
      throw error;
    }
  }

  async updateCompany(id: string, data: Partial<NewCompany>): Promise<Company | undefined> {
    try {
      logger.info({ id }, 'Updating company');
      return await this.companyRepository.update(id, data);
    } catch (error: any) {
      logger.error({ error, id }, 'Failed to update company');
      throw error;
    }
  }
}
