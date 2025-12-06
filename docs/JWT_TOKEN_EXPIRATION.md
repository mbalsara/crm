# JWT Token Expiration and Auto-Extension

## Current Token Validity

By default, JWT tokens expire after **24 hours** (`JWT_EXPIRES_IN=24h`).

You can configure this via environment variable:
```bash
JWT_EXPIRES_IN=20m  # 20 minutes
JWT_EXPIRES_IN=1h   # 1 hour
JWT_EXPIRES_IN=7d   # 7 days
```

## Token Expiration Behavior

### How It Works

1. **Token Creation:**
   ```typescript
   // Token includes expiration timestamp
   {
     userId: "...",
     tenantId: "...",
     iat: 1234567890,  // Issued at
     exp: 1234571490   // Expires at (iat + 20 minutes)
   }
   ```

2. **Token Validation:**
   - Middleware checks `exp` claim on every request
   - If `exp < now`, token is rejected with "Token has expired"

3. **No Auto-Extension:**
   - Once token expires, it cannot be extended
   - User must get a new token (login or refresh token)

## Auto-Extension Options

### Option 1: Refresh Tokens (Recommended)

**How it works:**
- Access token: Short-lived (20 minutes)
- Refresh token: Long-lived (7-30 days)
- When access token expires, use refresh token to get new access token
- Refresh token can be rotated for security

**Flow:**
```
1. Login → Get access_token (20m) + refresh_token (7d)
2. Use access_token for API calls
3. When access_token expires → Use refresh_token to get new access_token
4. Optionally rotate refresh_token (invalidate old, issue new)
```

### Option 2: Sliding Expiration (Not Recommended)

**How it works:**
- Token expiration extends automatically on each request
- If token expires in < 5 minutes, extend it by 20 minutes
- Problem: Requires database lookup to update expiration

**Why not recommended:**
- Defeats purpose of expiration (can't force logout)
- Requires stateful storage (defeats JWT statelessness)
- Security risk (stolen token never expires)

### Option 3: Token Version + Short Expiration

**How it works:**
- Short-lived tokens (20 minutes)
- Use token version for invalidation
- No auto-extension, but tokens are short-lived anyway

## Recommended: Refresh Token Pattern

### Implementation

**1. Add refresh token to database:**

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  token_hash TEXT NOT NULL UNIQUE,  -- Hashed refresh token
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  
  INDEX idx_user_tenant (user_id, tenant_id),
  INDEX idx_expires_at (expires_at)
);
```

**2. Update JWT creation:**

```typescript
// Short-lived access token (20 minutes)
export function createAccessToken(payload: { userId: string; tenantId: string }): string {
  return jwt.sign(payload, JWT_SECRET, {
    issuer: JWT_ISSUER,
    expiresIn: '20m',  // 20 minutes
  });
}

// Long-lived refresh token (7 days)
export function createRefreshToken(payload: { userId: string; tenantId: string }): string {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_SECRET,
    {
      issuer: JWT_ISSUER,
      expiresIn: '7d',  // 7 days
    }
  );
}
```

**3. Login endpoint returns both:**

```typescript
authRoutes.post('/login', async (c) => {
  // ... authenticate user ...
  
  const accessToken = createAccessToken({ userId: user.id, tenantId: user.tenantId });
  const refreshToken = createRefreshToken({ userId: user.id, tenantId: user.tenantId });
  
  // Store refresh token hash in database
  await refreshTokenRepository.create({
    userId: user.id,
    tenantId: user.tenantId,
    tokenHash: await hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });
  
  return {
    accessToken,
    refreshToken,
    expiresIn: 20 * 60, // 20 minutes in seconds
    user: { ... }
  };
});
```

**4. Refresh endpoint:**

```typescript
authRoutes.post('/refresh', async (c) => {
  const body = await c.req.json();
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(body);
  
  // Verify refresh token
  const claims = verifyJWT(refreshToken);
  if (claims.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }
  
  // Check if refresh token exists and is valid
  const tokenHash = await hashToken(refreshToken);
  const storedToken = await refreshTokenRepository.findByHash(tokenHash);
  
  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token invalid or expired');
  }
  
  // Update last used
  await refreshTokenRepository.updateLastUsed(storedToken.id);
  
  // Issue new access token
  const accessToken = createAccessToken({
    userId: claims.userId,
    tenantId: claims.tenantId,
  });
  
  return {
    accessToken,
    expiresIn: 20 * 60,
  };
});
```

**5. Client-side auto-refresh:**

```typescript
// In your API client
class BaseClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  
  async request(url: string, options: RequestInit): Promise<Response> {
    // Try request with access token
    let response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });
    
    // If token expired, refresh and retry
    if (response.status === 401 && this.refreshToken) {
      await this.refreshAccessToken();
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });
    }
    
    return response;
  }
  
  private async refreshAccessToken(): Promise<void> {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
    
    const data = await response.json();
    this.accessToken = data.data.accessToken;
  }
}
```

## Current Implementation (No Auto-Extension)

**Current behavior:**
- Token expires after 24 hours (configurable)
- No auto-extension
- User must login again when token expires

**To change expiration to 20 minutes:**

```bash
# In .env file
JWT_EXPIRES_IN=20m
```

**To implement refresh tokens:**
- See implementation above
- Requires database schema changes
- Requires refresh token repository
- Requires client-side refresh logic

## Summary

| Approach | Expiration | Auto-Extension | Complexity |
|----------|------------|----------------|------------|
| **Current (Simple)** | 24h (configurable) | ❌ No | Low |
| **Short-lived + Refresh** | 20m access, 7d refresh | ✅ Yes (via refresh) | Medium |
| **Sliding Expiration** | Extends on use | ✅ Yes | High (not recommended) |

**Recommendation:**
- For now: Use short expiration (20m) if needed
- Later: Implement refresh tokens for better UX
