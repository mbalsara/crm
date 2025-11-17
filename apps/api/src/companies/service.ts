import { injectable, inject } from '@crm/shared';
import { CompanyRepository } from './repository';
import { Logger } from '@crm/shared';
import type { Company, NewCompany } from './schema';

@injectable()
export class CompanyService {
  constructor(
    private companyRepository: CompanyRepository,
    @inject('Logger') private logger: Logger
  ) {}

  async getCompanyByDomain(tenantId: string, domain: string): Promise<Company | undefined> {
    try {
      this.logger.info(`Fetching company by domain: ${domain} for tenant: ${tenantId}`);
      return await this.companyRepository.findByDomain(tenantId, domain);
    } catch (error: any) {
      this.logger.error(`Failed to fetch company by domain: ${domain} for tenant: ${tenantId}`, error);
      throw error;
    }
  }

  async getCompanyById(id: string): Promise<Company | undefined> {
    try {
      this.logger.info(`Fetching company by id: ${id}`);
      return await this.companyRepository.findById(id);
    } catch (error: any) {
      this.logger.error(`Failed to fetch company by id: ${id}`, error);
      throw error;
    }
  }

  async getCompaniesByTenant(tenantId: string): Promise<Company[]> {
    try {
      this.logger.info(`Fetching companies by tenant: ${tenantId}`);
      return await this.companyRepository.findByTenantId(tenantId);
    } catch (error: any) {
      this.logger.error(`Failed to fetch companies by tenant: ${tenantId}`, error);
      throw error;
    }
  }

  async createCompany(data: NewCompany): Promise<Company> {
    try {
      this.logger.info(`Creating company: ${data.domain} for tenant: ${data.tenantId}`);
      return await this.companyRepository.create(data);
    } catch (error: any) {
      this.logger.error(`Failed to create company: ${data.domain} for tenant: ${data.tenantId}`, error);
      throw error;
    }
  }

  async upsertCompany(data: NewCompany): Promise<Company> {
    try {
      this.logger.info(`Upserting company: ${data.domain} for tenant: ${data.tenantId}`);
      return await this.companyRepository.upsert(data);
    } catch (error: any) {
      this.logger.error(`Failed to upsert company: ${data.domain} for tenant: ${data.tenantId}`, error);
      throw error;
    }
  }

  async updateCompany(id: string, data: Partial<NewCompany>): Promise<Company | undefined> {
    try {
      this.logger.info(`Updating company: ${id}`);
      return await this.companyRepository.update(id, data);
    } catch (error: any) {
      this.logger.error(`Failed to update company: ${id}`, error);
      throw error;
    }
  }
}
