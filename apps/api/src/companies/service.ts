import { injectable } from '@crm/shared';
import { CompanyRepository } from './repository';
import { logger } from '../utils/logger';
import type { Company, NewCompany } from './schema';
import type { Company as ClientCompany } from '@crm/clients/company';

/**
 * Convert internal Company (from database) to client-facing Company
 * Serializes company_domains table to domains array
 */
async function toClientCompany(
  company: Company | undefined,
  repository: CompanyRepository
): Promise<ClientCompany | undefined> {
  if (!company) return undefined;
  
  const domains = await repository.getDomains(company.id);
  if (domains.length === 0) {
    logger.warn({ companyId: company.id }, 'Company has no domains');
    return undefined;
  }
  
  return {
    id: company.id,
    tenantId: company.tenantId,
    domains, // Array of domains from company_domains table
    name: company.name,
    website: company.website,
    industry: company.industry,
    metadata: company.metadata,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  } as ClientCompany;
}

@injectable()
export class CompanyService {
  constructor(
    private companyRepository: CompanyRepository
  ) {}

  /**
   * Convert multiple internal companies to client-facing companies
   */
  private async toClientCompanies(companies: Company[]): Promise<ClientCompany[]> {
    const clientCompanies: ClientCompany[] = [];
    
    for (const company of companies) {
      const clientCompany = await toClientCompany(company, this.companyRepository);
      if (clientCompany) {
        clientCompanies.push(clientCompany);
      }
    }
    
    return clientCompanies;
  }

  async getCompanyByDomain(tenantId: string, domain: string): Promise<ClientCompany | undefined> {
    try {
      logger.info({ domain, tenantId }, 'Fetching company by domain');
      const company = await this.companyRepository.findByDomain(tenantId, domain);
      return await toClientCompany(company, this.companyRepository);
    } catch (error: any) {
      logger.error({ error, domain, tenantId }, 'Failed to fetch company by domain');
      throw error;
    }
  }

  async getCompanyById(id: string): Promise<ClientCompany | undefined> {
    try {
      logger.info({ id }, 'Fetching company by id');
      const company = await this.companyRepository.findById(id);
      return await toClientCompany(company, this.companyRepository);
    } catch (error: any) {
      logger.error({ error, id }, 'Failed to fetch company by id');
      throw error;
    }
  }

  async getCompaniesByTenant(tenantId: string): Promise<ClientCompany[]> {
    try {
      logger.info({ tenantId }, 'Fetching companies by tenant');
      const companies = await this.companyRepository.findByTenantId(tenantId);
      return await this.toClientCompanies(companies);
    } catch (error: any) {
      logger.error({ error, tenantId }, 'Failed to fetch companies by tenant');
      throw error;
    }
  }

  async createCompany(data: NewCompany & { domains: string[] }): Promise<ClientCompany> {
    try {
      logger.info({ domains: data.domains, tenantId: data.tenantId }, 'Creating company');
      // Use first domain for upsert logic (creates company if doesn't exist)
      const company = await this.companyRepository.create({ ...data, domain: data.domains[0] });
      
      // Add remaining domains
      for (let i = 1; i < data.domains.length; i++) {
        await this.companyRepository.addDomain(company.id, company.tenantId, data.domains[i]);
      }
      
      const clientCompany = await toClientCompany(company, this.companyRepository);
      if (!clientCompany) {
        throw new Error('Failed to convert company to client format after creation');
      }
      return clientCompany;
    } catch (error: any) {
      logger.error({ error, domains: data.domains, tenantId: data.tenantId }, 'Failed to create company');
      throw error;
    }
  }

  async upsertCompany(data: NewCompany & { domains: string[] }): Promise<ClientCompany> {
    try {
      logger.info({ domains: data.domains, tenantId: data.tenantId }, 'Upserting company');
      // Use first domain for upsert logic (finds or creates company)
      const company = await this.companyRepository.upsert({ ...data, domain: data.domains[0] });
      
      // Add remaining domains (will skip duplicates due to unique constraint)
      for (let i = 1; i < data.domains.length; i++) {
        await this.companyRepository.addDomain(company.id, company.tenantId, data.domains[i]);
      }
      
      const clientCompany = await toClientCompany(company, this.companyRepository);
      if (!clientCompany) {
        throw new Error('Failed to convert company to client format after upsert');
      }
      return clientCompany;
    } catch (error: any) {
      logger.error({ error, domains: data.domains, tenantId: data.tenantId }, 'Failed to upsert company');
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
