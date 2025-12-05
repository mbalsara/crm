-- =============================================================================
-- Employees and related tables
-- =============================================================================

DROP TABLE IF EXISTS employee_accessible_companies CASCADE;
DROP TABLE IF EXISTS employee_companies CASCADE;
DROP TABLE IF EXISTS employee_managers CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- -----------------------------------------------------------------------------
-- Employees - Core employee entity
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- Employee information
    first_name VARCHAR(60) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    email VARCHAR(255) NOT NULL,

    -- Status: 0 = active, 1 = inactive, 2 = archived
    row_status SMALLINT NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uniq_employees_tenant_email UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_status ON employees(tenant_id, row_status);

-- -----------------------------------------------------------------------------
-- Employee Managers - Direct manager relationships (source of truth)
-- One employee can have multiple managers (matrix organization).
-- Changes trigger async rebuild of employee_accessible_companies.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_managers (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    manager_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (employee_id, manager_id),
    CONSTRAINT chk_no_self_manager CHECK (employee_id != manager_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_managers_manager ON employee_managers(manager_id);
CREATE INDEX IF NOT EXISTS idx_employee_managers_employee ON employee_managers(employee_id);

-- -----------------------------------------------------------------------------
-- Employee Companies - Direct company assignments (source of truth)
-- An employee can be assigned to many companies (50-100+).
-- Changes trigger async rebuild of employee_accessible_companies.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_companies (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role VARCHAR(100), -- e.g., "account_manager", "consultant"
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (employee_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_companies_company ON employee_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_companies_employee ON employee_companies(employee_id);

-- -----------------------------------------------------------------------------
-- Employee Accessible Companies - Denormalized access control table
--
-- Contains ALL companies an employee can access (their own + all descendants').
-- Rebuilt asynchronously via Inngest with 5-minute debounce per tenant.
-- This enables O(1) access control queries instead of recursive hierarchy traversal.
--
-- Example: If Alice manages Bob, and Bob is assigned to CompanyX:
--   - Bob can access CompanyX (direct assignment)
--   - Alice can access CompanyX (via managing Bob)
--   Both rows exist in this table.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_accessible_companies (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    rebuilt_at TIMESTAMPTZ NOT NULL, -- When this row was computed

    PRIMARY KEY (employee_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_eac_company ON employee_accessible_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_eac_employee ON employee_accessible_companies(employee_id);

-- -----------------------------------------------------------------------------
-- Example queries:
--
-- Get all companies accessible to an employee (for access control):
--   SELECT company_id FROM employee_accessible_companies WHERE employee_id = ?;
--
-- Check if employee can access a specific company:
--   SELECT EXISTS(
--     SELECT 1 FROM employee_accessible_companies
--     WHERE employee_id = ? AND company_id = ?
--   );
--
-- Filter any table by accessible companies:
--   SELECT * FROM contacts
--   WHERE company_id IN (
--     SELECT company_id FROM employee_accessible_companies WHERE employee_id = ?
--   );
-- -----------------------------------------------------------------------------
