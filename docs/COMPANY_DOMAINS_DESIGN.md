# Company Domains Design

## Problem
Currently, companies have a single `domain` column. We need to support multiple domains per company to enable future company merging functionality without major refactoring.

## Solution: Separate `company_domains` Table

### Why This Approach?

1. **Proper Normalization**: Separate table allows proper relational design
2. **Unique Constraint**: Can enforce uniqueness per domain (not per company)
3. **Future-Proof**: Easy to merge companies (just reassign domain records)
4. **Lowercase Enforcement**: Database-level trigger ensures consistency
5. **Backward Compatible**: Can keep `domain` column during migration
6. **Minimal Refactoring**: Most changes isolated to repository layer

### Schema Design

```sql
company_domains (
    id UUID PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id),
    domain VARCHAR(255) NOT NULL, -- Lowercased in API layer
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE (tenant_id, domain) -- Domain unique per tenant
)
```

### Key Features

1. **Multiple Domains**: One company can have many domains
2. **Unique Constraint**: Each domain unique per tenant (across all companies)
3. **Lowercase Enforcement**: Handled in API layer (repository methods)
4. **Cascade Delete**: Deleting company removes all its domains
5. **Domain Selection**: First domain (oldest by created_at) used for API responses

### Implementation

**Schema Changes:**
- `companies` table has no `domain` column
- All domain information stored in `company_domains` table
- Domains automatically lowercased in API layer (repository methods)

**Code Changes:**
- `findByDomain()` queries `company_domains` table
- `create()`/`upsert()` automatically create domain records
- Service layer enriches companies with primary domain for API responses
- `company_domains` table is internal - not exposed in API

### Domain Matching Logic

When matching a domain to a company:

```typescript
// Normalize to lowercase
const normalizedDomain = domain.toLowerCase();

// Query company_domains table
const companyDomain = await db
  .select({ companyId: companyDomains.companyId })
  .from(companyDomains)
  .where(
    and(
      eq(companyDomains.tenantId, tenantId),
      eq(companyDomains.domain, normalizedDomain)
    )
  )
  .limit(1);

// Return associated company
return companyDomain[0]?.companyId;
```

### Benefits for Company Merging

When merging Company A into Company B:

```sql
-- Simply reassign domains
UPDATE company_domains 
SET company_id = 'company-b-id'
WHERE company_id = 'company-a-id';

-- Delete merged company
DELETE FROM companies WHERE id = 'company-a-id';
-- Domains cascade delete, but we already moved them
```

No complex refactoring needed!

### API Changes

**Before:**
```typescript
company.domain // string
```

**After:**
```typescript
company.domains // CompanyDomain[] (via join)
company.primaryDomain // string (computed)
```

**Query Interface (unchanged):**
```typescript
findByDomain(tenantId, domain) // Still works, queries company_domains
```

### Code Changes Required

1. **Repository**: Update `findByDomain()` to query `company_domains`
2. **Repository**: Update `create()`/`upsert()` to create domain records
3. **Service**: Add domain management methods (addDomain, removeDomain, etc.)
4. **Client Schema**: Update to support domains array (optional during migration)
5. **API Routes**: No changes needed (same interface)

### Testing Checklist

- [ ] Domain uniqueness enforced per tenant
- [ ] Domains automatically lowercased
- [ ] Domain matching works with any domain in array
- [ ] Primary domain can be retrieved
- [ ] Company creation creates domain record
- [ ] Company deletion cascades to domains
- [ ] Migration script migrates all existing domains
