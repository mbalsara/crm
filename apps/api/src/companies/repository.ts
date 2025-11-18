import { eq, and } from 'drizzle-orm';
import { injectable, inject } from '@crm/shared';
import type { Database } from '@crm/database';
import { companies, companyDomains, type Company, type NewCompany, type NewCompanyDomain } from './schema';
import { logger } from '../utils/logger';

@injectable()
export class CompanyRepository {
  constructor(@inject('Database') private db: Database) {}

  /**
   * Find company by domain (queries company_domains table internally)
   * Domain is automatically lowercased
   */
  async findByDomain(tenantId: string, domain: string): Promise<Company | undefined> {
    const normalizedDomain = domain.toLowerCase();
    
    const result = await this.db
      .select({
        id: companies.id,
        tenantId: companies.tenantId,
        name: companies.name,
        website: companies.website,
        industry: companies.industry,
        metadata: companies.metadata,
        createdAt: companies.createdAt,
        updatedAt: companies.updatedAt,
      })
      .from(companies)
      .innerJoin(companyDomains, eq(companies.id, companyDomains.companyId))
      .where(
        and(
          eq(companyDomains.tenantId, tenantId),
          eq(companyDomains.domain, normalizedDomain)
        )
      )
      .limit(1);
    
    return result[0];
  }

  async findById(id: string): Promise<Company | undefined> {
    const result = await this.db.select().from(companies).where(eq(companies.id, id));
    return result[0];
  }

  async findByTenantId(tenantId: string): Promise<Company[]> {
    return this.db.select().from(companies).where(eq(companies.tenantId, tenantId));
  }

  /**
   * Create company and automatically create domain record in company_domains
   * Domain is required and will be stored in lowercase
   */
  async create(data: NewCompany & { domain: string }): Promise<Company> {
    const normalizedDomain = data.domain.toLowerCase();
    
    return await this.db.transaction(async (tx) => {
      // Create company (without domain column)
      const { domain, ...companyData } = data;
      const companyResult = await tx.insert(companies).values(companyData).returning();
      const company = companyResult[0];

      // Create domain record
      await tx.insert(companyDomains).values({
        companyId: company.id,
        tenantId: company.tenantId,
        domain: normalizedDomain,
        verified: false,
      });

      logger.debug({ companyId: company.id, domain: normalizedDomain }, 'Created company with domain');
      return company;
    });
  }

  /**
   * Upsert company by domain
   * If company exists for domain, update it; otherwise create new company
   * Automatically manages company_domains table
   */
  async upsert(data: NewCompany & { domain: string }): Promise<Company> {
    const normalizedDomain = data.domain.toLowerCase();
    
    return await this.db.transaction(async (tx) => {
      // Check if domain already exists
      const existingDomain = await tx
        .select({ companyId: companyDomains.companyId })
        .from(companyDomains)
        .where(
          and(
            eq(companyDomains.tenantId, data.tenantId),
            eq(companyDomains.domain, normalizedDomain)
          )
        )
        .limit(1);

      if (existingDomain.length > 0) {
        // Update existing company
        const companyId = existingDomain[0].companyId;
        const { domain, ...companyData } = data;
        
        const updated = await tx
          .update(companies)
          .set({ ...companyData, updatedAt: new Date() })
          .where(eq(companies.id, companyId))
          .returning();
        
        logger.debug({ companyId, domain: normalizedDomain }, 'Updated existing company by domain');
        return updated[0];
      } else {
        // Create new company with domain
        return await this.create(data);
      }
    });
  }

  async update(id: string, data: Partial<NewCompany>): Promise<Company | undefined> {
    const result = await this.db
      .update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return result[0];
  }

  /**
   * Upsert company with multiple domains in a single transaction
   * Performs upsert and adds all domains atomically
   * Note: Domain validation should be done in service layer before calling this method
   */
  async upsertWithDomains(data: NewCompany & { domains: string[] }): Promise<Company> {
    const firstDomain = data.domains[0].toLowerCase();
    
    return await this.db.transaction(async (tx) => {
      // Step 1: Check if first domain exists to determine if we're updating or creating
      const existingDomain = await tx
        .select({ companyId: companyDomains.companyId })
        .from(companyDomains)
        .where(
          and(
            eq(companyDomains.tenantId, data.tenantId),
            eq(companyDomains.domain, firstDomain)
          )
        )
        .limit(1);

      let company: Company;
      
      if (existingDomain.length > 0) {
        // Update existing company
        const companyId = existingDomain[0].companyId;
        const { domains, ...companyData } = data;
        
        const updated = await tx
          .update(companies)
          .set({ ...companyData, updatedAt: new Date() })
          .where(eq(companies.id, companyId))
          .returning();
        
        company = updated[0];
        logger.debug({ companyId, domain: firstDomain }, 'Updated existing company by domain');
      } else {
        // Create new company
        const { domains, ...companyData } = data;
        const companyResult = await tx.insert(companies).values(companyData).returning();
        company = companyResult[0];
        
        // Add first domain
        await tx.insert(companyDomains).values({
          companyId: company.id,
          tenantId: company.tenantId,
          domain: firstDomain,
          verified: false,
        });
        
        logger.debug({ companyId: company.id, domain: firstDomain }, 'Created company with domain');
      }

      // Step 2: Add remaining domains (skip if already exist for this company)
      for (let i = 1; i < data.domains.length; i++) {
        const normalizedDomain = data.domains[i].toLowerCase();
        
        // Check if domain already exists for this company (OK to skip)
        const existingForCompany = await tx
          .select({ id: companyDomains.id })
          .from(companyDomains)
          .where(
            and(
              eq(companyDomains.companyId, company.id),
              eq(companyDomains.domain, normalizedDomain)
            )
          )
          .limit(1);
        
        if (existingForCompany.length === 0) {
          await tx.insert(companyDomains).values({
            companyId: company.id,
            tenantId: company.tenantId,
            domain: normalizedDomain,
            verified: false,
          });
          logger.debug({ companyId: company.id, domain: normalizedDomain }, 'Added domain to company');
        }
      }

      return company;
    });
  }

  /**
   * Add additional domain to existing company
   * Internal method for domain management
   */
  async addDomain(companyId: string, tenantId: string, domain: string): Promise<void> {
    const normalizedDomain = domain.toLowerCase();
    
    await this.db.insert(companyDomains).values({
      companyId,
      tenantId,
      domain: normalizedDomain,
      verified: false,
    }).onConflictDoNothing();
    
    logger.debug({ companyId, domain: normalizedDomain }, 'Added domain to company');
  }

  /**
   * Get first domain for a company (oldest by created_at)
   * Internal method for domain management
   */
  async getFirstDomain(companyId: string): Promise<string | undefined> {
    const result = await this.db
      .select({ domain: companyDomains.domain })
      .from(companyDomains)
      .where(eq(companyDomains.companyId, companyId))
      .orderBy(companyDomains.createdAt)
      .limit(1);
    
    return result[0]?.domain;
  }

  /**
   * Get all domains for a company
   * Internal method for domain management
   */
  async getDomains(companyId: string): Promise<string[]> {
    const result = await this.db
      .select({ domain: companyDomains.domain })
      .from(companyDomains)
      .where(eq(companyDomains.companyId, companyId));
    
    return result.map(r => r.domain);
  }
}
