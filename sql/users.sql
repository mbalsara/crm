-- =============================================================================
-- Users and related tables
-- =============================================================================

DROP TABLE IF EXISTS user_accessible_companies CASCADE;
DROP TABLE IF EXISTS user_companies CASCADE;
DROP TABLE IF EXISTS user_managers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- -----------------------------------------------------------------------------
-- Users - Core user entity (employees/users are same)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- User information
    first_name VARCHAR(60) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    email VARCHAR(255) NOT NULL,

    -- Status: 0 = active, 1 = inactive, 2 = archived
    row_status SMALLINT NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uniq_users_tenant_email UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_status ON users(tenant_id, row_status);

-- -----------------------------------------------------------------------------
-- User Managers - Direct manager relationships (source of truth)
-- One user can have multiple managers (matrix organization).
-- Changes trigger async rebuild of user_accessible_companies.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_managers (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    manager_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, manager_id),
    CONSTRAINT chk_no_self_manager CHECK (user_id != manager_id)
);

CREATE INDEX IF NOT EXISTS idx_user_managers_manager ON user_managers(manager_id);
CREATE INDEX IF NOT EXISTS idx_user_managers_user ON user_managers(user_id);

-- -----------------------------------------------------------------------------
-- User Companies - Direct company assignments (source of truth)
-- A user can be assigned to many companies (50-100+).
-- Changes trigger async rebuild of user_accessible_companies.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_companies (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role VARCHAR(100), -- e.g., "account_manager", "consultant"
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_user_companies_company ON user_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_user ON user_companies(user_id);

-- -----------------------------------------------------------------------------
-- User Accessible Companies - Denormalized access control table
--
-- Contains ALL companies a user can access (their own + all descendants').
-- Rebuilt asynchronously via Inngest with 5-minute debounce per tenant.
-- This enables O(1) access control queries instead of recursive hierarchy traversal.
--
-- Example: If Alice manages Bob, and Bob is assigned to CompanyX:
--   - Bob can access CompanyX (direct assignment)
--   - Alice can access CompanyX (via managing Bob)
--   Both rows exist in this table.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_accessible_companies (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    rebuilt_at TIMESTAMPTZ NOT NULL, -- When this row was computed

    PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_uac_company ON user_accessible_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_uac_user ON user_accessible_companies(user_id);

-- -----------------------------------------------------------------------------
-- Example queries:
--
-- Get all companies accessible to a user (for access control):
--   SELECT company_id FROM user_accessible_companies WHERE user_id = ?;
--
-- Check if user can access a specific company:
--   SELECT EXISTS(
--     SELECT 1 FROM user_accessible_companies
--     WHERE user_id = ? AND company_id = ?
--   );
--
-- Filter any table by accessible companies:
--   SELECT * FROM contacts
--   WHERE company_id IN (
--     SELECT company_id FROM user_accessible_companies WHERE user_id = ?
--   );
-- -----------------------------------------------------------------------------
