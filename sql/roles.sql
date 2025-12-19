-- =============================================================================
-- Roles - RBAC (Role-Based Access Control)
-- =============================================================================

DROP TABLE IF EXISTS roles CASCADE;

-- -----------------------------------------------------------------------------
-- Roles - System and custom roles for access control
-- Each tenant has their own set of roles. System roles are seeded and cannot
-- be deleted. Custom roles can be created by administrators.
--
-- Permissions are stored as an integer array where each integer maps to a
-- specific permission:
--   1 = USER_ADD      - Can add users
--   2 = USER_EDIT     - Can edit users
--   3 = USER_DEL      - Can delete/deactivate users
--   4 = CUSTOMER_ADD  - Can add customers
--   5 = CUSTOMER_EDIT - Can edit customers
--   6 = CUSTOMER_DEL  - Can delete customers
--   7 = USER_CUSTOMER_MANAGE - Can manage user-customer assignments
--   8 = ADMIN         - Full admin access, bypasses scoped queries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- Role information
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Permissions as array of integers (see mapping above)
    permissions INTEGER[] NOT NULL DEFAULT '{}',

    -- System roles (seeded) cannot be deleted
    is_system BOOLEAN NOT NULL DEFAULT false,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uniq_roles_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);

-- -----------------------------------------------------------------------------
-- Add role_id foreign key to users table
-- This links each user to their RBAC role
-- -----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- -----------------------------------------------------------------------------
-- Seed default system roles for each tenant
-- These roles are created automatically and cannot be deleted
-- -----------------------------------------------------------------------------

-- User role: Basic access, no management permissions
INSERT INTO roles (tenant_id, name, description, permissions, is_system)
SELECT id, 'User', 'Basic view access', '{}', true FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Manager role: Full management within scope (all permissions except ADMIN)
INSERT INTO roles (tenant_id, name, description, permissions, is_system)
SELECT id, 'Manager', 'Full management within scope', '{1,2,3,4,5,6,7}', true FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Administrator role: Full access including admin bypass
INSERT INTO roles (tenant_id, name, description, permissions, is_system)
SELECT id, 'Administrator', 'Full admin access', '{1,2,3,4,5,6,7,8}', true FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Assign default roles to existing users
-- First user per tenant gets Administrator, others get User role
-- -----------------------------------------------------------------------------

-- Assign first user per tenant as Administrator
WITH admin_roles AS (
    SELECT id, tenant_id FROM roles WHERE name = 'Administrator'
),
first_users AS (
    SELECT DISTINCT ON (tenant_id) id, tenant_id
    FROM users
    ORDER BY tenant_id, created_at ASC
)
UPDATE users u SET role_id = ar.id
FROM first_users fu, admin_roles ar
WHERE u.id = fu.id AND fu.tenant_id = ar.tenant_id;

-- Assign remaining users (without role) as User role
WITH user_roles AS (
    SELECT id, tenant_id FROM roles WHERE name = 'User'
)
UPDATE users u SET role_id = ur.id
FROM user_roles ur
WHERE u.tenant_id = ur.tenant_id AND u.role_id IS NULL;

-- -----------------------------------------------------------------------------
-- Example queries:
--
-- Get all roles for a tenant:
--   SELECT * FROM roles WHERE tenant_id = ?;
--
-- Get user's permissions:
--   SELECT r.permissions FROM users u
--   JOIN roles r ON u.role_id = r.id
--   WHERE u.id = ?;
--
-- Check if user has a specific permission (e.g., ADMIN = 8):
--   SELECT 8 = ANY(r.permissions) FROM users u
--   JOIN roles r ON u.role_id = r.id
--   WHERE u.id = ?;
-- -----------------------------------------------------------------------------
