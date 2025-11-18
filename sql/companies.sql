DROP TABLE IF EXISTS companies CASCADE;

-- Companies table
-- Note: Domain information is stored in company_domains table (see company_domains.sql)
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Company information
    name TEXT, -- Extracted from emails or manual entry
    website TEXT,
    industry VARCHAR(100),
    
    -- Metadata
    metadata JSONB, -- Additional company data
    
    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
