import { eq, and } from 'drizzle-orm';
import { injectable, inject } from '@crm/shared';
import type { Database } from '@crm/database';
import { contacts, type Contact, type NewContact } from './schema';

@injectable()
export class ContactRepository {
  constructor(@inject('Database') private db: Database) {}

  async findByEmail(tenantId: string, email: string): Promise<Contact | undefined> {
    const result = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email)));
    return result[0];
  }

  async findById(id: string): Promise<Contact | undefined> {
    const result = await this.db.select().from(contacts).where(eq(contacts.id, id));
    return result[0];
  }

  async findByTenantId(tenantId: string): Promise<Contact[]> {
    return this.db.select().from(contacts).where(eq(contacts.tenantId, tenantId));
  }

  async findByCompanyId(companyId: string): Promise<Contact[]> {
    return this.db.select().from(contacts).where(eq(contacts.companyId, companyId));
  }

  async create(data: NewContact): Promise<Contact> {
    const result = await this.db.insert(contacts).values(data).returning();
    return result[0];
  }

  async upsert(data: NewContact): Promise<Contact> {
    // PostgreSQL upsert using ON CONFLICT
    const result = await this.db
      .insert(contacts)
      .values(data)
      .onConflictDoUpdate({
        target: [contacts.tenantId, contacts.email],
        set: {
          name: data.name,
          companyId: data.companyId,
          title: data.title,
          phone: data.phone,
          companyName: data.companyName,
          signatureData: data.signatureData,
          metadata: data.metadata,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  }

  async update(id: string, data: Partial<NewContact>): Promise<Contact | undefined> {
    const result = await this.db
      .update(contacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    return result[0];
  }
}
