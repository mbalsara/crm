import { injectable, inject } from 'tsyringe';
import type { Database } from '@crm/database';
import type { NewEmail } from './schema';
import { emails } from './schema';
import { companyDomains } from '../companies/company-domains-schema';
import { eq, and, desc, sql, or, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger';

@injectable()
export class EmailRepository {
  constructor(@inject('Database') private db: Database) {}

  async bulkInsert(emailData: NewEmail[]) {
    if (emailData.length === 0) {
      return { insertedCount: 0, skippedCount: 0 };
    }

    try {
      // Insert emails, skip duplicates based on (tenantId, provider, messageId) unique constraint
      const result = await this.db
        .insert(emails)
        .values(emailData)
        .onConflictDoNothing({
          target: [emails.tenantId, emails.provider, emails.messageId],
        })
        .returning({ id: emails.id });

      return {
        insertedCount: result.length,
        skippedCount: emailData.length - result.length,
      };
    } catch (error: any) {
      logger.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          code: error.code,
        },
        emailCount: emailData.length,
        sampleTenantId: emailData[0]?.tenantId,
      }, 'Failed to bulk insert emails');
      throw error;
    }
  }

  async findByTenant(tenantId: string, options?: { limit?: number; offset?: number }) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    return this.db
      .select()
      .from(emails)
      .where(eq(emails.tenantId, tenantId))
      .orderBy(desc(emails.receivedAt))
      .limit(limit)
      .offset(offset);
  }

  async findByThread(tenantId: string, threadId: string) {
    return this.db
      .select()
      .from(emails)
      .where(and(eq(emails.tenantId, tenantId), eq(emails.threadId, threadId)))
      .orderBy(desc(emails.receivedAt));
  }

  async exists(tenantId: string, provider: string, messageId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: emails.id })
      .from(emails)
      .where(
        and(
          eq(emails.tenantId, tenantId),
          eq(emails.provider, provider),
          eq(emails.messageId, messageId)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Find email by ID
   * @param emailId - Email UUID
   * Note: tenantId will be extracted from the email record
   * Future: tenant isolation will be handled via requestHeader middleware
   */
  async findById(emailId: string) {
    const result = await this.db
      .select()
      .from(emails)
      .where(eq(emails.id, emailId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find emails by company
   * Matches emails where the sender's email domain belongs to the company
   * @param tenantId - Tenant UUID
   * @param companyId - Company UUID
   * @param options - Pagination options
   */
  async findByCompany(
    tenantId: string,
    companyId: string,
    options?: { limit?: number; offset?: number }
  ) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    // First, get all domains for this company
    const domains = await this.db
      .select({ domain: companyDomains.domain })
      .from(companyDomains)
      .where(
        and(
          eq(companyDomains.tenantId, tenantId),
          eq(companyDomains.companyId, companyId)
        )
      );

    if (domains.length === 0) {
      return [];
    }

    // Build domain matching conditions
    // Match emails where fromEmail ends with @domain
    const domainConditions = domains.map((d) =>
      sql`LOWER(${emails.fromEmail}) LIKE ${'%@' + d.domain.toLowerCase()}`
    );

    // Query emails where sender domain matches any company domain
    const result = await this.db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.tenantId, tenantId),
          or(...domainConditions)
        )
      )
      .orderBy(desc(emails.receivedAt))
      .limit(limit)
      .offset(offset);

    return result;
  }

  /**
   * Count emails by company
   */
  async countByCompany(tenantId: string, companyId: string): Promise<number> {
    // First, get all domains for this company
    const domains = await this.db
      .select({ domain: companyDomains.domain })
      .from(companyDomains)
      .where(
        and(
          eq(companyDomains.tenantId, tenantId),
          eq(companyDomains.companyId, companyId)
        )
      );

    if (domains.length === 0) {
      return 0;
    }

    // Build domain matching conditions
    const domainConditions = domains.map((d) =>
      sql`LOWER(${emails.fromEmail}) LIKE ${'%@' + d.domain.toLowerCase()}`
    );

    // Count emails
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(emails)
      .where(
        and(
          eq(emails.tenantId, tenantId),
          or(...domainConditions)
        )
      );

    return result[0]?.count || 0;
  }

  /**
   * Get email counts for multiple companies in a single query
   * @param tenantId - Tenant UUID
   * @param companyIds - Array of company UUIDs
   * @returns Map of companyId to email count
   */
  async getCountsByCompanyIds(
    tenantId: string,
    companyIds: string[]
  ): Promise<Record<string, number>> {
    if (companyIds.length === 0) {
      return {};
    }

    // Get all domains for the companies
    const domainsResult = await this.db
      .select({
        companyId: companyDomains.companyId,
        domain: companyDomains.domain,
      })
      .from(companyDomains)
      .where(
        and(
          eq(companyDomains.tenantId, tenantId),
          inArray(companyDomains.companyId, companyIds)
        )
      );

    if (domainsResult.length === 0) {
      return {};
    }

    // Build a map of domain -> companyId for reverse lookup
    const domainToCompany: Record<string, string> = {};
    for (const row of domainsResult) {
      domainToCompany[row.domain.toLowerCase()] = row.companyId;
    }

    const allDomains = Object.keys(domainToCompany);

    // Build domain matching conditions
    const domainConditions = allDomains.map((domain) =>
      sql`LOWER(${emails.fromEmail}) LIKE ${'%@' + domain}`
    );

    // Query emails and extract domain from fromEmail
    const emailsResult = await this.db
      .select({
        fromEmail: emails.fromEmail,
      })
      .from(emails)
      .where(
        and(
          eq(emails.tenantId, tenantId),
          or(...domainConditions)
        )
      );

    // Count emails per company
    const counts: Record<string, number> = {};
    for (const companyId of companyIds) {
      counts[companyId] = 0;
    }

    for (const email of emailsResult) {
      const emailDomain = email.fromEmail.split('@')[1]?.toLowerCase();
      if (emailDomain && domainToCompany[emailDomain]) {
        counts[domainToCompany[emailDomain]]++;
      }
    }

    return counts;
  }

  /**
   * Get the last contact date (last email sent TO customer) for multiple companies
   * This finds the most recent email where the recipient is from the customer's domain
   * @param tenantId - Tenant UUID
   * @param companyIds - Array of company UUIDs
   * @returns Map of companyId to last contact date
   */
  async getLastContactDatesByCompanyIds(
    tenantId: string,
    companyIds: string[]
  ): Promise<Record<string, Date>> {
    if (companyIds.length === 0) {
      return {};
    }

    // Get all domains for the companies
    const domainsResult = await this.db
      .select({
        companyId: companyDomains.companyId,
        domain: companyDomains.domain,
      })
      .from(companyDomains)
      .where(
        and(
          eq(companyDomains.tenantId, tenantId),
          inArray(companyDomains.companyId, companyIds)
        )
      );

    if (domainsResult.length === 0) {
      return {};
    }

    // Build a map of domain -> companyId for reverse lookup
    const domainToCompany: Record<string, string> = {};
    for (const row of domainsResult) {
      domainToCompany[row.domain.toLowerCase()] = row.companyId;
    }

    const allDomains = Object.keys(domainToCompany);

    // Build conditions to find emails where any recipient matches company domains
    // Using JSON containment to check if tos array contains emails with matching domains
    const domainConditions = allDomains.map((domain) =>
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements(${emails.tos}) AS t
        WHERE LOWER(t->>'email') LIKE ${'%@' + domain}
      )`
    );

    // Query emails sent TO customer domains, ordered by date
    const emailsResult = await this.db
      .select({
        tos: emails.tos,
        receivedAt: emails.receivedAt,
      })
      .from(emails)
      .where(
        and(
          eq(emails.tenantId, tenantId),
          or(...domainConditions)
        )
      )
      .orderBy(desc(emails.receivedAt));

    // Find last contact date per company
    const lastContacts: Record<string, Date> = {};

    for (const email of emailsResult) {
      if (!email.tos) continue;

      for (const recipient of email.tos) {
        const recipientDomain = recipient.email.split('@')[1]?.toLowerCase();
        if (recipientDomain && domainToCompany[recipientDomain]) {
          const companyId = domainToCompany[recipientDomain];
          // Only set if not already set (since results are ordered by date desc)
          if (!lastContacts[companyId]) {
            lastContacts[companyId] = email.receivedAt;
          }
        }
      }
    }

    return lastContacts;
  }
}
