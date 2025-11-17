DROP TABLE IF EXISTS companies CASCADE;

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Domain information
    domain VARCHAR(255) NOT NULL, -- e.g., "acme.com" (top-level only)
    
    -- Company information
    name TEXT, -- Extracted from emails or manual entry
    website TEXT,
    industry VARCHAR(100),
    
    -- Metadata
    metadata JSONB, -- Additional company data
    
    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uniq_companies_tenant_domain UNIQUE (tenant_id, domain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_companies_tenant_domain ON companies(tenant_id, domain);
