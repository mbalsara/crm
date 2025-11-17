import { eq, and } from 'drizzle-orm';
import { injectable, inject } from '@crm/shared';
import type { Database } from '@crm/database';
import { companies, type Company, type NewCompany } from './schema';

@injectable()
export class CompanyRepository {
  constructor(@inject('Database') private db: Database) {}

  async findByDomain(tenantId: string, domain: string): Promise<Company | undefined> {
    const result = await this.db
      .select()
      .from(companies)
      .where(and(eq(companies.tenantId, tenantId), eq(companies.domain, domain)));
    return result[0];
  }

  async findById(id: string): Promise<Company | undefined> {
    const result = await this.db.select().from(companies).where(eq(companies.id, id));
    return result[0];
  }

  async findByTenantId(tenantId: string): Promise<Company[]> {
    return this.db.select().from(companies).where(eq(companies.tenantId, tenantId));
  }

  async create(data: NewCompany): Promise<Company> {
    const result = await this.db.insert(companies).values(data).returning();
    return result[0];
  }

  async upsert(data: NewCompany): Promise<Company> {
    // PostgreSQL upsert using ON CONFLICT
    const result = await this.db
      .insert(companies)
      .values(data)
      .onConflictDoUpdate({
        target: [companies.tenantId, companies.domain],
        set: {
          name: data.name,
          website: data.website,
          industry: data.industry,
          metadata: data.metadata,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  }

  async update(id: string, data: Partial<NewCompany>): Promise<Company | undefined> {
    const result = await this.db
      .update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return result[0];
  }
}
