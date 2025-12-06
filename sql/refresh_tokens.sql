-- =============================================================================
-- Refresh Tokens - Long-lived tokens for refreshing access tokens
-- =============================================================================

DROP TABLE IF EXISTS refresh_tokens CASCADE;

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hash of refresh token
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    
    CONSTRAINT uniq_refresh_tokens_token_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_tenant ON refresh_tokens(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- -----------------------------------------------------------------------------
-- Notes:
--
-- 1. Token hash is SHA-256 of the refresh token (prevents token theft)
-- 2. Refresh tokens expire after 7 days (configurable via REFRESH_TOKEN_EXPIRES_IN)
-- 3. Refresh tokens can be revoked (logout, security breach)
-- 4. Cleanup expired/revoked tokens periodically
-- -----------------------------------------------------------------------------
