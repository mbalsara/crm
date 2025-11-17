DROP TABLE IF EXISTS contacts CASCADE;

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    
    -- Contact information
    email VARCHAR(500) NOT NULL,
    name TEXT,
    
    -- Extracted from signature
    title VARCHAR(200),
    phone VARCHAR(50),
    
    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uniq_contacts_tenant_email UNIQUE (tenant_id, email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_email ON contacts(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_company ON contacts(tenant_id, company_id);
