import { injectable, inject } from 'tsyringe';
import { logger } from '../utils/logger';

export interface DomainEnrichmentResult {
  name?: string;
  website?: string;
  industry?: string;
  description?: string;
  logo?: string;
  employees?: number;
  location?: string;
  metadata?: Record<string, any>;
}

export interface DomainEnrichmentConfig {
  enabled: boolean;
  provider: 'clearbit' | 'hunter' | 'brandfetch' | 'none';
  apiKey?: string;
  cacheEnabled: boolean;
  cacheTTL: number; // days
  fallbackToSimple: boolean;
}

/**
 * Service for enriching customer data from domain names
 * Supports multiple providers with fallback chain
 *
 * NOTE: This service is available but NOT currently called.
 * Will be enabled when user opts in for paid enrichment service (Clearbit, etc.)
 */
@injectable()
export class DomainEnrichmentService {
  private cache: Map<string, { data: DomainEnrichmentResult; expiresAt: number }> = new Map();

  /**
   * Enrich domain with customer information
   */
  async enrichDomain(
    domain: string,
    config: DomainEnrichmentConfig
  ): Promise<DomainEnrichmentResult | null> {
    try {
      // Check cache first
      if (config.cacheEnabled) {
        const cached = this.getCached(domain, config.cacheTTL);
        if (cached) {
          logger.debug({ domain }, 'Using cached domain enrichment data');
          return cached;
        }
      }

      // If enrichment disabled, return null (will use simple inference)
      if (!config.enabled || config.provider === 'none') {
        logger.debug({ domain }, 'Domain enrichment disabled, skipping');
        return null;
      }

      // Try enrichment API
      let result: DomainEnrichmentResult | null = null;

      switch (config.provider) {
        case 'clearbit':
          result = await this.enrichWithClearbit(domain, config.apiKey);
          break;
        case 'hunter':
          result = await this.enrichWithHunter(domain, config.apiKey);
          break;
        case 'brandfetch':
          result = await this.enrichWithBrandfetch(domain, config.apiKey);
          break;
      }

      // Cache result if successful
      if (result && config.cacheEnabled) {
        this.setCache(domain, result, config.cacheTTL);
      }

      return result;
    } catch (error: any) {
      logger.error(
        { error: error.message, stack: error.stack, domain, provider: config.provider },
        'Failed to enrich domain'
      );
      
      // Return null if fallback enabled (will use simple inference)
      if (config.fallbackToSimple) {
        logger.info({ domain }, 'Falling back to simple inference');
        return null;
      }
      
      throw error;
    }
  }

  /**
   * Enrich domain using Clearbit API
   */
  private async enrichWithClearbit(
    domain: string,
    apiKey?: string
  ): Promise<DomainEnrichmentResult | null> {
    if (!apiKey) {
      logger.warn({ domain }, 'Clearbit API key not configured');
      return null;
    }

    try {
      const response = await fetch(`https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (response.status === 404) {
        logger.debug({ domain }, 'Domain not found in Clearbit');
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ domain, status: response.status, error: errorText }, 'Clearbit API error');
        return null;
      }

      const data = await response.json() as any;

      return {
        name: data.name,
        website: data.domain,
        industry: data.industry,
        description: data.description,
        logo: data.logo,
        employees: data.metrics?.employees,
        location: data.geo?.city ? `${data.geo.city}, ${data.geo.state}` : undefined,
        metadata: {
          sector: data.category?.sector,
          funding: data.metrics?.raised,
          founded: data.foundedYear,
          phone: data.phone,
          linkedin: data.linkedin?.handle,
          twitter: data.twitter?.handle,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message, domain }, 'Clearbit API request failed');
      return null;
    }
  }

  /**
   * Enrich domain using Hunter.io API
   */
  private async enrichWithHunter(
    domain: string,
    apiKey?: string
  ): Promise<DomainEnrichmentResult | null> {
    if (!apiKey) {
      logger.warn({ domain }, 'Hunter.io API key not configured');
      return null;
    }

    try {
      const response = await fetch(
        `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ domain, status: response.status, error: errorText }, 'Hunter.io API error');
        return null;
      }

      const data = await response.json() as any;

      if (!data.data || !data.data.company) {
        logger.debug({ domain }, 'Domain not found in Hunter.io');
        return null;
      }

      return {
        name: data.data.company,
        website: domain,
        industry: data.data.industry,
        employees: data.data.company_size,
        location: data.data.country,
        metadata: {
          linkedin: data.data.linkedin_url,
          twitter: data.data.twitter,
          facebook: data.data.facebook,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message, domain }, 'Hunter.io API request failed');
      return null;
    }
  }

  /**
   * Enrich domain using Brandfetch API
   */
  private async enrichWithBrandfetch(
    domain: string,
    apiKey?: string
  ): Promise<DomainEnrichmentResult | null> {
    if (!apiKey) {
      logger.warn({ domain }, 'Brandfetch API key not configured');
      return null;
    }

    try {
      const response = await fetch(`https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (response.status === 404) {
        logger.debug({ domain }, 'Domain not found in Brandfetch');
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ domain, status: response.status, error: errorText }, 'Brandfetch API error');
        return null;
      }

      const data = await response.json() as any;

      return {
        name: data.name,
        website: domain,
        logo: data.logos?.[0]?.image,
        description: data.description,
        metadata: {
          colors: data.colors,
          fonts: data.fonts,
          social: data.links,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message, domain }, 'Brandfetch API request failed');
      return null;
    }
  }

  /**
   * Simple domain-based customer name inference (fallback)
   * e.g., "acme.com" -> "Acme"
   */
  inferCustomerNameFromDomain(domain: string): string {
    try {
      const namePart = domain.split('.')[0];
      return namePart
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    } catch (error: any) {
      logger.warn({ error: error.message, domain }, 'Failed to infer customer name from domain');
      return domain;
    }
  }

  /**
   * Get cached enrichment data
   */
  private getCached(domain: string, ttlDays: number): DomainEnrichmentResult | null {
    const cached = this.cache.get(domain);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(domain);
      return null;
    }

    return cached.data;
  }

  /**
   * Set cache for enrichment data
   */
  private setCache(domain: string, data: DomainEnrichmentResult, ttlDays: number): void {
    const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
    this.cache.set(domain, { data, expiresAt });
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache(domain?: string): void {
    if (domain) {
      this.cache.delete(domain);
    } else {
      this.cache.clear();
    }
  }
}
