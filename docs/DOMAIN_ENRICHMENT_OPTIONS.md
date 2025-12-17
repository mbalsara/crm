# Domain Enrichment Options for Company Name Inference

## Overview

Simple domain-based company name inference (e.g., "acme.com" → "Acme") is weak. This document explores better options for enriching company data from domains.

---

## Option 1: Clearbit Domain API (Recommended for Production)

**Provider**: Clearbit  
**Cost**: Free tier: 50 requests/month, Paid: $99/month for 1,000 requests  
**API**: `https://company.clearbit.com/v2/customers/find?domain={domain}`  
**Features**:
- Company name, logo, description
- Industry, sector, employees
- Location, website
- Social profiles
- Funding information

**Pros**:
- High quality data
- Reliable API
- Good free tier for testing
- Well-documented

**Cons**:
- Paid for production use
- Rate limits

**Example Response**:
```json
{
  "name": "Acme Corporation",
  "domain": "acme.com",
  "logo": "https://logo.clearbit.com/acme.com",
  "description": "Leading provider of...",
  "industry": "Technology",
  "employees": 500,
  "location": "San Francisco, CA"
}
```

---

## Option 2: Hunter.io Domain Search API

**Provider**: Hunter.io  
**Cost**: Free tier: 25 requests/month, Paid: $49/month for 1,000 requests  
**API**: `https://api.hunter.io/v2/domain-search?domain={domain}&api_key={key}`  
**Features**:
- Company name
- Industry
- Company size
- Location
- Social profiles

**Pros**:
- Good free tier
- Reliable

**Cons**:
- Less comprehensive than Clearbit
- Focused on email/contact data

---

## Option 3: Brandfetch API

**Provider**: Brandfetch  
**Cost**: Free tier: 100 requests/month, Paid: $99/month for 5,000 requests  
**API**: `https://api.brandfetch.io/v2/brands/{domain}`  
**Features**:
- Company name, logo
- Brand colors, fonts
- Social profiles
- Industry

**Pros**:
- Good for branding data
- Generous free tier

**Cons**:
- Less company metadata than Clearbit
- Focused on brand assets

---

## Option 4: OpenCorporates API (Free, Open Source)

**Provider**: OpenCorporates  
**Cost**: Free (with attribution), Paid plans available  
**API**: `https://api.opencorporates.com/v0.4/customers/search?q={domain}`  
**Features**:
- Official company name
- Registration number
- Jurisdiction
- Status
- Officers

**Pros**:
- Free and open source
- Official company data
- Good for legal entity info

**Cons**:
- Requires domain → company name mapping (not direct)
- May not have all customers
- More complex to use

---

## Option 5: DNS TXT Records (Free, Limited)

**Approach**: Query DNS TXT records for company info  
**Cost**: Free  
**Features**:
- Some customers publish info in TXT records
- Very limited coverage

**Pros**:
- Free
- No API limits

**Cons**:
- Very limited data availability
- Not standardized
- Unreliable

---

## Option 6: Hybrid Approach (Recommended)

**Strategy**: Combine multiple sources with fallback chain

1. **Primary**: Clearbit Domain API (if configured)
2. **Secondary**: Hunter.io (if Clearbit fails)
3. **Tertiary**: Simple domain inference (current approach)

**Benefits**:
- Best data quality when APIs available
- Graceful degradation
- Cost-effective (use free tiers first)
- Configurable per tenant

---

## Implementation Recommendation

### Phase 1: Simple Enhancement (Current)
- Use simple domain inference as fallback
- Add configuration for API keys
- Structure code for easy API integration

### Phase 2: Add Clearbit Integration
- Integrate Clearbit Domain API
- Add caching (avoid duplicate API calls)
- Fallback to simple inference

### Phase 3: Add Multiple Providers
- Support multiple enrichment APIs
- Provider selection per tenant
- Cost tracking

---

## Caching Strategy

**Important**: Cache enrichment results to avoid:
- Duplicate API calls for same domain
- Rate limit issues
- Unnecessary costs

**Cache Key**: `domain-enrichment:{domain}`  
**TTL**: 30 days (company data doesn't change often)  
**Storage**: Redis or database table

---

## Configuration

```typescript
interface DomainEnrichmentConfig {
  enabled: boolean;
  provider: 'clearbit' | 'hunter' | 'brandfetch' | 'none';
  apiKey?: string;
  cacheEnabled: boolean;
  cacheTTL: number; // days
  fallbackToSimple: boolean; // Use simple inference if API fails
}
```

---

## Cost Analysis

**10,000 unique domains/month**:
- Clearbit: ~$99/month (1,000 requests) + $0.10 per additional = ~$900/month
- Hunter.io: ~$49/month (1,000 requests) + $0.05 per additional = ~$450/month
- Brandfetch: ~$99/month (5,000 requests) = ~$99/month
- Simple inference: $0/month

**Recommendation**: 
- Start with simple inference + caching
- Add Clearbit for high-value tenants
- Use free tiers for testing

---

## Next Steps

1. Implement configurable enrichment service
2. Add Clearbit integration (with fallback)
3. Add caching layer
4. Make provider configurable per tenant
5. Add cost tracking
