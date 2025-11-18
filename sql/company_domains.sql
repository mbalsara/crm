-- Company Domains table
-- Supports multiple domains per company (for future company merging)
-- Each domain is unique across all companies (within a tenant)

CREATE TABLE IF NOT EXISTS company_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Domain (lowercase enforced in API layer)
    domain VARCHAR(255) NOT NULL,
    
    -- Metadata
    verified BOOLEAN NOT NULL DEFAULT false, -- Whether domain is verified
    
    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Each domain must be unique per tenant
    CONSTRAINT uniq_company_domains_tenant_domain UNIQUE (tenant_id, domain)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_domains_company_id ON company_domains(company_id);
CREATE INDEX IF NOT EXISTS idx_company_domains_tenant_domain ON company_domains(tenant_id, domain);
