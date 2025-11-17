import { injectable, inject } from 'tsyringe';
import type { Email } from '@crm/shared';
import { CompanyClient } from '@crm/clients';
import { logger } from '../utils/logger';
// Domain enrichment service available but not used yet - will be enabled when customer opts in
// import { DomainEnrichmentService, type DomainEnrichmentConfig } from './domain-enrichment';

/**
 * Personal email providers to exclude from company extraction
 */
const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'email.com',
]);

export interface ExtractedDomain {
  domain: string;
  domainType: 'business' | 'personal' | 'excluded';
}

export interface ExtractedCompany {
  id: string;
  domain: string;
  name?: string | null;
}

@injectable()
export class DomainExtractionService {
  constructor(
    private companyClient: CompanyClient
  ) {}

  /**
   * Extract top-level domain from email address
   * Handles: subdomain.example.com -> example.com
   */
  extractTopLevelDomain(email: string): string | null {
    try {
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain) {
        logger.warn({ email }, 'No domain found in email address');
        return null;
      }

      // Check if personal domain
      if (PERSONAL_DOMAINS.has(domain)) {
        logger.debug({ domain }, 'Domain is personal email provider, excluding');
        return null;
      }

      // Extract top-level domain (simple approach - can be enhanced with public suffix list)
      const parts = domain.split('.');
      if (parts.length >= 2) {
        // Return last two parts (e.g., example.com, co.uk)
        return parts.slice(-2).join('.');
      }

      return domain;
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack, email }, 'Failed to extract top-level domain');
      return null;
    }
  }

  /**
   * Extract all unique domains from email
   */
  extractDomains(email: Email): ExtractedDomain[] {
    const domains = new Set<string>();
    const results: ExtractedDomain[] = [];

    try {
      // From sender
      const fromDomain = this.extractTopLevelDomain(email.from.email);
      if (fromDomain) {
        domains.add(fromDomain);
        results.push({
          domain: fromDomain,
          domainType: PERSONAL_DOMAINS.has(fromDomain) ? 'personal' : 'business',
        });
      }

      // Recipients
      const allRecipients = [
        ...(email.tos || []),
        ...(email.ccs || []),
        ...(email.bccs || []),
      ];

      for (const addr of allRecipients) {
        const domain = this.extractTopLevelDomain(addr.email);
        if (domain && !domains.has(domain)) {
          domains.add(domain);
          results.push({
            domain,
            domainType: PERSONAL_DOMAINS.has(domain) ? 'personal' : 'business',
          });
        }
      }

      logger.info({ emailId: email.messageId, domainsFound: results.length }, 'Extracted domains from email');
      return results;
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack, emailId: email.messageId }, 'Failed to extract domains from email');
      return [];
    }
  }

  /**
   * Extract domains and create/update companies
   */
  async extractAndCreateCompanies(tenantId: string, email: Email): Promise<ExtractedCompany[]> {
    try {
      const domains = this.extractDomains(email);
      const companies: ExtractedCompany[] = [];

      logger.info({ tenantId, domainsCount: domains.length }, 'Creating/updating companies from extracted domains');

      for (const { domain, domainType } of domains) {
        try {
          // Skip personal domains
          if (domainType === 'personal') {
            logger.debug({ domain }, 'Skipping personal domain');
            continue;
          }

          // Infer company name from domain (simple approach)
          const inferredName = this.inferCompanyName(domain);

          // Upsert company
          const company = await this.companyClient.upsertCompany({
            tenantId,
            domain,
            domainType: 'business',
            name: inferredName,
          });

          companies.push({
            id: company.id,
            domain: company.domain,
            name: company.name || undefined,
          });

          logger.info({ tenantId, domain, companyId: company.id }, 'Successfully created/updated company');
        } catch (error: any) {
          logger.error(
            { error: error.message, stack: error.stack, tenantId, domain },
            'Failed to create/update company'
          );
          // Continue with other domains even if one fails
        }
      }

      logger.info({ tenantId, companiesCreated: companies.length }, 'Completed company extraction');
      return companies;
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack, tenantId, emailId: email.messageId }, 'Failed to extract and create companies');
      throw error;
    }
  }

  /**
   * Infer company name from domain
   * Simple approach: "acme.com" -> "Acme"
   * 
   * TODO: When customer opts in for Clearbit/enrichment service:
   * - Check tenant config for enrichment enabled
   * - Call enrichmentService.enrichDomain() if enabled
   * - Use enriched data (name, industry, logo, etc.) if available
   * - Fallback to simple inference if enrichment fails or disabled
   */
  private inferCompanyName(domain: string): string {
    try {
      const namePart = domain.split('.')[0];
      return namePart
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    } catch (error: any) {
      logger.warn({ error: error.message, domain }, 'Failed to infer company name from domain');
      return domain;
    }
  }
}
