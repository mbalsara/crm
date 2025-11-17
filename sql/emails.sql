DROP TABLE IF EXISTS emails CASCADE;

-- Emails table
CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    gmail_message_id TEXT NOT NULL,
    gmail_thread_id TEXT NOT NULL,
    subject TEXT,
    from_email TEXT NOT NULL,
    from_name TEXT,
    tos JSONB NOT NULL,
    ccs JSONB NOT NULL DEFAULT '[]'::jsonb,
    bccs JSONB NOT NULL DEFAULT '[]'::jsonb,
    body TEXT,
    priority TEXT,
    labels JSONB NOT NULL DEFAULT '[]'::jsonb,
    received_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uniq_emails_tenant_message UNIQUE (tenant_id, gmail_message_id)
);
-- Emails indexes
CREATE INDEX idx_emails_tenant_message ON emails(tenant_id, gmail_message_id);
CREATE INDEX idx_emails_tenant_received ON emails(tenant_id, received_at);
CREATE INDEX idx_emails_thread ON emails(tenant_id, gmail_thread_id);
