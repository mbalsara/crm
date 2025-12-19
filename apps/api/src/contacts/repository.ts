import { eq, and, asc } from 'drizzle-orm';
import { injectable, inject } from 'tsyringe';
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

  /**
   * Batch find contacts by email addresses
   * Returns a map of email -> Contact for efficient lookup
   */
  async findByEmails(tenantId: string, emails: string[]): Promise<Map<string, Contact>> {
    if (emails.length === 0) {
      return new Map();
    }

    const { inArray } = await import('drizzle-orm');
    const result = await this.db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          inArray(contacts.email, emails)
        )
      );

    const emailMap = new Map<string, Contact>();
    for (const contact of result) {
      emailMap.set(contact.email.toLowerCase(), contact);
    }
    return emailMap;
  }

  async findById(id: string): Promise<Contact | undefined> {
    const result = await this.db.select().from(contacts).where(eq(contacts.id, id));
    return result[0];
  }

  async findByTenantId(tenantId: string): Promise<Contact[]> {
    return this.db.select().from(contacts).where(eq(contacts.tenantId, tenantId));
  }

  async findByCustomerId(customerId: string): Promise<Contact[]> {
    return this.db
      .select()
      .from(contacts)
      .where(eq(contacts.customerId, customerId))
      .orderBy(asc(contacts.name), asc(contacts.title), asc(contacts.email));
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
          customerId: data.customerId,
          title: data.title,
          phone: data.phone,
          mobile: data.mobile,
          address: data.address,
          website: data.website,
          linkedin: data.linkedin,
          x: data.x,
          linktree: data.linktree,
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

  /**
   * Signature data that can be used to enrich a contact
   */
  static readonly SIGNATURE_FIELDS = ['name', 'title', 'phone', 'mobile', 'address', 'website', 'linkedin', 'x', 'linktree'] as const;

  /**
   * Enrich contact with signature data - only updates fields that are currently empty
   * Returns which fields were updated for logging purposes
   */
  async enrichFromSignature(
    id: string,
    signatureData: {
      name?: string;
      title?: string;
      phone?: string;
      mobile?: string;
      address?: string;
      website?: string;
      linkedin?: string;
      x?: string;
      linktree?: string;
    }
  ): Promise<{ updated: boolean; fieldsUpdated: string[]; contact?: Contact }> {
    // First get the current contact to check which fields are empty
    const current = await this.findById(id);
    if (!current) {
      return { updated: false, fieldsUpdated: [] };
    }

    // Only update fields that are currently empty in the contact
    const updates: Partial<NewContact> = {};
    const fieldsUpdated: string[] = [];

    // Helper to check if a value is valid (not empty, not placeholder)
    const isValidValue = (value: string | undefined | null): boolean => {
      if (!value) return false;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length > 0 && trimmed !== 'string' && trimmed !== 'null' && trimmed !== 'undefined';
    };

    // Check each field
    for (const field of ContactRepository.SIGNATURE_FIELDS) {
      const currentValue = current[field as keyof Contact];
      const signatureValue = signatureData[field as keyof typeof signatureData];

      if (!currentValue && isValidValue(signatureValue)) {
        (updates as any)[field] = signatureValue!.trim();
        fieldsUpdated.push(field);
      }
    }

    if (fieldsUpdated.length === 0) {
      return { updated: false, fieldsUpdated: [], contact: current };
    }

    const updatedContact = await this.update(id, updates);
    return { updated: true, fieldsUpdated, contact: updatedContact };
  }
}
