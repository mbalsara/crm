-- ============================================
-- CRM Database Schema
-- ============================================
--
-- Connection: postgresql://neondb_owner:npg_1gHnfsaiR8Fz@ep-odd-thunder-a88b2g71-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require
--
-- Execute in order:
-- 1. DROP statements (to reset)
-- 2. CREATE statements
-- ============================================

-- ============================================
-- DROP STATEMENTS (Execute in reverse dependency order)
-- ============================================

-- Drop tables
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS runs CASCADE;
DROP TABLE IF EXISTS integrations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Drop enums
DROP TYPE IF EXISTS run_type CASCADE;
DROP TYPE IF EXISTS run_status CASCADE;
DROP TYPE IF EXISTS integration_auth_type CASCADE;
DROP TYPE IF EXISTS integration_source CASCADE;

-- ============================================
-- CREATE ENUMS
-- ============================================

CREATE TYPE integration_source AS ENUM ('gmail', 'outlook', 'slack', 'other');

CREATE TYPE integration_auth_type AS ENUM ('oauth', 'service_account', 'api_key');

CREATE TYPE run_status AS ENUM ('running', 'completed', 'failed');

CREATE TYPE run_type AS ENUM ('initial', 'incremental', 'historical', 'webhook');

-- ============================================
-- CREATE TABLES
-- ============================================

-- Tenants table
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Integrations table
CREATE TABLE integrations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    source integration_source NOT NULL,
    auth_type integration_auth_type NOT NULL,
    parameters JSONB NOT NULL,
    token TEXT,
    token_expires_at TIMESTAMP,
    last_run_token TEXT,
    last_run_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMP,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Runs table
CREATE TABLE runs (
    id UUID PRIMARY KEY,
    integration_id UUID NOT NULL REFERENCES integrations(id),
    tenant_id UUID NOT NULL,
    status run_status NOT NULL,
    run_type run_type NOT NULL,
    items_processed INTEGER NOT NULL DEFAULT 0,
    items_inserted INTEGER NOT NULL DEFAULT 0,
    items_skipped INTEGER NOT NULL DEFAULT 0,
    start_token TEXT,
    end_token TEXT,
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Emails table
CREATE TABLE emails (
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
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================
-- CREATE INDEXES
-- ============================================

-- Runs indexes
CREATE INDEX idx_runs_tenant_status ON runs(tenant_id, status, started_at);
CREATE INDEX idx_runs_integration_status ON runs(integration_id, status, started_at);

-- Emails indexes
CREATE INDEX idx_emails_tenant_message ON emails(tenant_id, gmail_message_id);
CREATE INDEX idx_emails_tenant_received ON emails(tenant_id, received_at);
CREATE INDEX idx_emails_thread ON emails(tenant_id, gmail_thread_id);

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Insert default tenant
-- INSERT INTO tenants (id, name)
-- VALUES (gen_random_uuid(), 'default');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check all tables
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- Check all enums
-- SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname;

-- Check all indexes
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname;
