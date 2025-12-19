import { injectable, inject } from 'tsyringe';
import { ScopedRepository, type AccessContext } from '@crm/database';
import type { Database } from '@crm/database';
import type { NewEmail, NewEmailParticipant } from './schema';
import { emails, EmailAnalysisStatus, emailParticipants } from './schema';
import { customerDomains } from '../customers/customer-domains-schema';
import { eq, and, desc, sql, or, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger';

@injectable()
export class EmailRepository extends ScopedRepository {
  constructor(@inject('Database') db: Database) {
    super(db);
  }

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
   * Update email sentiment fields after analysis
   * @param emailId - Email UUID
   * @param sentiment - Sentiment value ('positive', 'negative', 'neutral')
   * @param sentimentScore - Confidence score (0-1)
   * @param tx - Optional transaction context
   */
  async updateSentiment(
    emailId: string,
    sentiment: 'positive' | 'negative' | 'neutral',
    sentimentScore: number,
    tx?: any
  ): Promise<void> {
    const db = tx ?? this.db;
    await db
      .update(emails)
      .set({
        sentiment,
        sentimentScore: sentimentScore.toFixed(2),
        analysisStatus: EmailAnalysisStatus.Completed,
        updatedAt: new Date(),
      })
      .where(eq(emails.id, emailId));
  }

  /**
   * Find emails by customer
   * Matches emails where the sender's email domain belongs to the customer
   * @param tenantId - Tenant UUID
   * @param customerId - Customer UUID
   * @param options - Pagination options
   */
  async findByCustomer(
    tenantId: string,
    customerId: string,
    options?: { limit?: number; offset?: number }
  ) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    // First, get all domains for this customer
    const domains = await this.db
      .select({ domain: customerDomains.domain })
      .from(customerDomains)
      .where(
        and(
          eq(customerDomains.tenantId, tenantId),
          eq(customerDomains.customerId, customerId)
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

    // Query emails where sender domain matches any customer domain
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
   * Count emails by customer
   */
  async countByCustomer(tenantId: string, customerId: string): Promise<number> {
    // First, get all domains for this customer
    const domains = await this.db
      .select({ domain: customerDomains.domain })
      .from(customerDomains)
      .where(
        and(
          eq(customerDomains.tenantId, tenantId),
          eq(customerDomains.customerId, customerId)
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
   * Get email counts for multiple customers in a single query
   * @param tenantId - Tenant UUID
   * @param customerIds - Array of customer UUIDs
   * @returns Map of customerId to email count
   */
  async getCountsByCustomerIds(
    tenantId: string,
    customerIds: string[]
  ): Promise<Record<string, number>> {
    if (customerIds.length === 0) {
      return {};
    }

    // Get all domains for the customers
    const domainsResult = await this.db
      .select({
        customerId: customerDomains.customerId,
        domain: customerDomains.domain,
      })
      .from(customerDomains)
      .where(
        and(
          eq(customerDomains.tenantId, tenantId),
          inArray(customerDomains.customerId, customerIds)
        )
      );

    if (domainsResult.length === 0) {
      return {};
    }

    // Build a map of domain -> customerId for reverse lookup
    const domainToCustomer: Record<string, string> = {};
    for (const row of domainsResult) {
      domainToCustomer[row.domain.toLowerCase()] = row.customerId;
    }

    const allDomains = Object.keys(domainToCustomer);

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

    // Count emails per customer
    const counts: Record<string, number> = {};
    for (const customerId of customerIds) {
      counts[customerId] = 0;
    }

    for (const email of emailsResult) {
      const emailDomain = email.fromEmail.split('@')[1]?.toLowerCase();
      if (emailDomain && domainToCustomer[emailDomain]) {
        counts[domainToCustomer[emailDomain]]++;
      }
    }

    return counts;
  }

  /**
   * Get the last contact date (last email sent TO customer) for multiple customers
   * This finds the most recent email where the recipient is from the customer's domain
   * @param tenantId - Tenant UUID
   * @param customerIds - Array of customer UUIDs
   * @returns Map of customerId to last contact date
   */
  async getLastContactDatesByCustomerIds(
    tenantId: string,
    customerIds: string[]
  ): Promise<Record<string, Date>> {
    if (customerIds.length === 0) {
      return {};
    }

    // Get all domains for the customers
    const domainsResult = await this.db
      .select({
        customerId: customerDomains.customerId,
        domain: customerDomains.domain,
      })
      .from(customerDomains)
      .where(
        and(
          eq(customerDomains.tenantId, tenantId),
          inArray(customerDomains.customerId, customerIds)
        )
      );

    if (domainsResult.length === 0) {
      return {};
    }

    // Build a map of domain -> customerId for reverse lookup
    const domainToCustomer: Record<string, string> = {};
    for (const row of domainsResult) {
      domainToCustomer[row.domain.toLowerCase()] = row.customerId;
    }

    const allDomains = Object.keys(domainToCustomer);

    // Build conditions to find emails where any recipient matches customer domains
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

    // Find last contact date per customer
    const lastContacts: Record<string, Date> = {};

    for (const email of emailsResult) {
      if (!email.tos) continue;

      for (const recipient of email.tos) {
        const recipientDomain = recipient.email.split('@')[1]?.toLowerCase();
        if (recipientDomain && domainToCustomer[recipientDomain]) {
          const customerId = domainToCustomer[recipientDomain];
          // Only set if not already set (since results are ordered by date desc)
          if (!lastContacts[customerId]) {
            lastContacts[customerId] = email.receivedAt;
          }
        }
      }
    }

    return lastContacts;
  }

  /**
   * Get aggregate sentiment for multiple customers
   * Returns the dominant sentiment from recent emails for each customer
   * @param tenantId - Tenant UUID
   * @param customerIds - Array of customer UUIDs
   * @returns Map of customerId to sentiment info
   */
  async getAggregateSentimentByCustomerIds(
    tenantId: string,
    customerIds: string[]
  ): Promise<Record<string, { value: 'positive' | 'negative' | 'neutral'; confidence: number }>> {
    if (customerIds.length === 0) {
      return {};
    }

    // Get all domains for the customers
    const domainsResult = await this.db
      .select({
        customerId: customerDomains.customerId,
        domain: customerDomains.domain,
      })
      .from(customerDomains)
      .where(
        and(
          eq(customerDomains.tenantId, tenantId),
          inArray(customerDomains.customerId, customerIds)
        )
      );

    if (domainsResult.length === 0) {
      return {};
    }

    // Build a map of domain -> customerId for reverse lookup
    const domainToCustomer: Record<string, string> = {};
    for (const row of domainsResult) {
      domainToCustomer[row.domain.toLowerCase()] = row.customerId;
    }

    const allDomains = Object.keys(domainToCustomer);

    // Build domain matching conditions
    const domainConditions = allDomains.map((domain) =>
      sql`LOWER(${emails.fromEmail}) LIKE ${'%@' + domain}`
    );

    // Query emails with sentiment, ordered by date (most recent first)
    // Only include emails that have been analyzed
    const emailsResult = await this.db
      .select({
        fromEmail: emails.fromEmail,
        sentiment: emails.sentiment,
        sentimentScore: emails.sentimentScore,
      })
      .from(emails)
      .where(
        and(
          eq(emails.tenantId, tenantId),
          or(...domainConditions),
          sql`${emails.sentiment} IS NOT NULL`
        )
      )
      .orderBy(desc(emails.receivedAt))
      .limit(1000); // Limit to recent emails for performance

    // Aggregate sentiment per customer
    // Count positive/negative/neutral and calculate average confidence
    const customerSentiments: Record<string, {
      positive: number;
      negative: number;
      neutral: number;
      totalConfidence: number;
      count: number;
    }> = {};

    // Initialize all customers
    for (const customerId of customerIds) {
      customerSentiments[customerId] = {
        positive: 0,
        negative: 0,
        neutral: 0,
        totalConfidence: 0,
        count: 0,
      };
    }

    // Process emails
    for (const email of emailsResult) {
      const emailDomain = email.fromEmail.split('@')[1]?.toLowerCase();
      if (!emailDomain || !domainToCustomer[emailDomain]) continue;

      const customerId = domainToCustomer[emailDomain];
      const sentiment = email.sentiment as 'positive' | 'negative' | 'neutral' | null;
      const score = email.sentimentScore ? parseFloat(email.sentimentScore) : 0.5;

      if (!sentiment) continue;

      customerSentiments[customerId][sentiment]++;
      customerSentiments[customerId].totalConfidence += score;
      customerSentiments[customerId].count++;
    }

    // Calculate dominant sentiment for each customer
    const result: Record<string, { value: 'positive' | 'negative' | 'neutral'; confidence: number }> = {};

    for (const [customerId, counts] of Object.entries(customerSentiments)) {
      if (counts.count === 0) continue;

      // Find dominant sentiment
      let dominant: 'positive' | 'negative' | 'neutral' = 'neutral';
      let maxCount = counts.neutral;

      if (counts.positive > maxCount) {
        dominant = 'positive';
        maxCount = counts.positive;
      }
      if (counts.negative > maxCount) {
        dominant = 'negative';
        maxCount = counts.negative;
      }

      // Average confidence
      const avgConfidence = counts.totalConfidence / counts.count;

      result[customerId] = {
        value: dominant,
        confidence: Math.round(avgConfidence * 100) / 100, // Round to 2 decimals
      };
    }

    return result;
  }

  // ===========================================================================
  // Access-Controlled Queries (using email_participants)
  // ===========================================================================

  /**
   * Returns SQL for filtering emails by user's accessible customers.
   * Uses email_participants table to join emails to customers.
   *
   * Query pattern:
   * - Joins emails → email_participants → user_accessible_customers
   * - Only returns emails where at least one participant is from an accessible customer
   */
  private emailAccessSubquery(context: AccessContext): ReturnType<typeof sql> {
    return sql`${emails.id} IN (
      SELECT DISTINCT ep.email_id
      FROM email_participants ep
      INNER JOIN user_accessible_customers uac ON ep.customer_id = uac.customer_id
      WHERE uac.user_id = ${context.userId}
    )`;
  }

  /**
   * Find emails with access control
   * Only returns emails where user has access to at least one participant's customer
   */
  async findByTenantScoped(
    context: AccessContext,
    options?: { limit?: number; offset?: number }
  ) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    return this.db
      .select()
      .from(emails)
      .where(
        and(
          this.tenantFilter(emails.tenantId, context),
          this.emailAccessSubquery(context)
        )
      )
      .orderBy(desc(emails.receivedAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Find emails by customer with access control
   * Verifies user has access to the customer before returning emails
   */
  async findByCustomerScoped(
    context: AccessContext,
    customerId: string,
    options?: { limit?: number; offset?: number }
  ) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    // First verify user has access to this customer
    const hasAccess = await this.hasCustomerAccess(context, customerId);
    if (!hasAccess) {
      return [];
    }

    // Find emails where this customer is a participant
    return this.db
      .selectDistinct({ emails })
      .from(emails)
      .innerJoin(emailParticipants, eq(emails.id, emailParticipants.emailId))
      .where(
        and(
          eq(emails.tenantId, context.tenantId),
          eq(emailParticipants.customerId, customerId)
        )
      )
      .orderBy(desc(emails.receivedAt))
      .limit(limit)
      .offset(offset)
      .then(rows => rows.map(r => r.emails));
  }

  /**
   * Count emails by customer with access control
   */
  async countByCustomerScoped(context: AccessContext, customerId: string): Promise<number> {
    // First verify user has access to this customer
    const hasAccess = await this.hasCustomerAccess(context, customerId);
    if (!hasAccess) {
      return 0;
    }

    const result = await this.db
      .select({ count: sql<number>`count(DISTINCT ${emails.id})::int` })
      .from(emails)
      .innerJoin(emailParticipants, eq(emails.id, emailParticipants.emailId))
      .where(
        and(
          eq(emails.tenantId, context.tenantId),
          eq(emailParticipants.customerId, customerId)
        )
      );

    return result[0]?.count || 0;
  }

  /**
   * Find email by ID with access control
   * Returns null if user doesn't have access
   */
  async findByIdScoped(context: AccessContext, emailId: string) {
    const result = await this.db
      .selectDistinct({ emails })
      .from(emails)
      .innerJoin(emailParticipants, eq(emails.id, emailParticipants.emailId))
      .innerJoin(
        sql`user_accessible_customers uac`,
        sql`${emailParticipants.customerId} = uac.customer_id AND uac.user_id = ${context.userId}`
      )
      .where(
        and(
          eq(emails.id, emailId),
          eq(emails.tenantId, context.tenantId)
        )
      )
      .limit(1);

    return result[0]?.emails || null;
  }

  // ===========================================================================
  // Email Participants Management
  // ===========================================================================

  /**
   * Create email participants for an email
   * Called after inserting a new email to create the participant links
   * @param participants - Array of participants to create
   * @param tx - Optional transaction context
   */
  async createParticipants(participants: NewEmailParticipant[], tx?: any): Promise<void> {
    if (participants.length === 0) {
      return;
    }

    const db = tx ?? this.db;
    await db
      .insert(emailParticipants)
      .values(participants)
      .onConflictDoNothing();
  }

  /**
   * Get participants for an email
   */
  async getParticipants(emailId: string) {
    return this.db
      .select()
      .from(emailParticipants)
      .where(eq(emailParticipants.emailId, emailId));
  }

  /**
   * Get email counts by customer IDs using email_participants
   * More efficient than domain matching for access-controlled queries
   */
  async getCountsByCustomerIdsScoped(
    context: AccessContext,
    customerIds: string[]
  ): Promise<Record<string, number>> {
    if (customerIds.length === 0) {
      return {};
    }

    // Filter to only accessible customers
    const accessibleCustomerIds = await this.db
      .select({ customerId: sql<string>`uac.customer_id` })
      .from(sql`user_accessible_customers uac`)
      .where(
        and(
          sql`uac.user_id = ${context.userId}`,
          inArray(sql`uac.customer_id`, customerIds)
        )
      );

    const accessible = accessibleCustomerIds.map(r => r.customerId);
    if (accessible.length === 0) {
      return {};
    }

    // Count emails per customer
    const result = await this.db
      .select({
        customerId: emailParticipants.customerId,
        count: sql<number>`count(DISTINCT ${emails.id})::int`,
      })
      .from(emailParticipants)
      .innerJoin(emails, eq(emails.id, emailParticipants.emailId))
      .where(
        and(
          eq(emails.tenantId, context.tenantId),
          inArray(emailParticipants.customerId, accessible)
        )
      )
      .groupBy(emailParticipants.customerId);

    // Build result map
    const counts: Record<string, number> = {};
    for (const customerId of customerIds) {
      counts[customerId] = 0;
    }
    for (const row of result) {
      if (row.customerId) {
        counts[row.customerId] = row.count;
      }
    }

    return counts;
  }
}
