DROP TABLE IF EXISTS emails CASCADE;

-- Emails table (individual messages, provider-agnostic)
CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,

    -- Provider identifiers
    integration_id UUID REFERENCES integrations(id),
    provider VARCHAR(50) NOT NULL, -- 'gmail', 'outlook', etc. (from integration_source)
    message_id VARCHAR(500) NOT NULL, -- provider's unique message ID

    -- Email content
    subject TEXT NOT NULL,
    body TEXT,

    -- Sender
    from_email VARCHAR(500) NOT NULL,
    from_name VARCHAR(500),

    -- Recipients (arrays of objects: [{email, name}])
    tos JSONB,
    ccs JSONB,
    bccs JSONB,

    -- Metadata
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    labels TEXT[],
    received_at TIMESTAMP NOT NULL,

    -- Provider-specific data (store Gmail labels, Outlook categories, etc.)
    metadata JSONB,

    -- Analysis (computed async)
    sentiment VARCHAR(20), -- 'positive', 'negative', 'neutral'
    sentiment_score DECIMAL(3,2), -- -1.0 to 1.0

    -- Tracking
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Unique constraint
    CONSTRAINT uniq_emails_tenant_provider_message UNIQUE (tenant_id, provider, message_id)
);

-- Indexes
CREATE INDEX idx_emails_tenant_received ON emails(tenant_id, received_at DESC);
CREATE INDEX idx_emails_thread ON emails(thread_id, received_at DESC);
CREATE INDEX idx_emails_from ON emails(tenant_id, from_email);
CREATE INDEX idx_emails_provider_message ON emails(provider, message_id);
CREATE INDEX idx_emails_integration ON emails(integration_id);
