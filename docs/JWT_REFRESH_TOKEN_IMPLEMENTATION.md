# Refresh Token Implementation Guide

## Overview

This document explains how to implement refresh tokens for auto-extending JWT authentication.

## Current Token Expiration

- **Default:** 20 minutes (`JWT_EXPIRES_IN=20m`)
- **No auto-extension:** Token expires, user must login again

## Refresh Token Pattern

### How It Works

1. **Login** → Get `accessToken` (20m) + `refreshToken` (7d)
2. **API calls** → Use `accessToken`
3. **Token expires** → Use `refreshToken` to get new `accessToken`
4. **Auto-refresh** → Client automatically refreshes before expiration

### Benefits

- ✅ Short-lived access tokens (better security)
- ✅ Long-lived refresh tokens (better UX)
- ✅ Can revoke refresh tokens (force logout)
- ✅ Can rotate refresh tokens (security)

## Implementation Steps

### Step 1: Database Schema

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hash of refresh token
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  
  INDEX idx_user_tenant (user_id, tenant_id),
  INDEX idx_expires_at (expires_at),
  INDEX idx_token_hash (token_hash)
);
```

### Step 2: Update JWT Utils

```typescript
// apps/api/src/utils/jwt.ts

export function createAccessToken(payload: {
  userId: string;
  tenantId: string;
  email?: string;
}): string {
  return jwt.sign(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      type: 'access',
    },
    JWT_SECRET,
    {
      issuer: JWT_ISSUER,
      expiresIn: process.env.JWT_EXPIRES_IN || '20m', // 20 minutes
    }
  );
}

export function createRefreshToken(payload: {
  userId: string;
  tenantId: string;
}): string {
  return jwt.sign(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      type: 'refresh',
    },
    JWT_SECRET,
    {
      issuer: JWT_ISSUER,
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d', // 7 days
    }
  );
}

export function verifyJWT(token: string): JWTPayload {
  // ... existing code ...
}

export function hashToken(token: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

### Step 3: Refresh Token Repository

```typescript
// apps/api/src/auth/refresh-token-repository.ts
import { injectable, inject } from 'tsyringe';
import { eq, and, gte, isNull } from 'drizzle-orm';
import type { Database } from '@crm/database';
import { refreshTokens } from './refresh-token-schema';

@injectable()
export class RefreshTokenRepository {
  constructor(@inject('Database') private db: Database) {}

  async create(data: {
    userId: string;
    tenantId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const result = await this.db.insert(refreshTokens).values(data).returning();
    return result[0];
  }

  async findByHash(tokenHash: string) {
    const result = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gte(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1);
    return result[0];
  }

  async updateLastUsed(id: string) {
    await this.db
      .update(refreshTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(refreshTokens.id, id));
  }

  async revoke(id: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, id));
  }

  async revokeAllForUser(userId: string, tenantId: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.tenantId, tenantId),
          isNull(refreshTokens.revokedAt)
        )
      );
  }

  async cleanupExpired() {
    await this.db
      .delete(refreshTokens)
      .where(
        and(
          gte(refreshTokens.expiresAt, new Date()),
          isNotNull(refreshTokens.revokedAt)
        )
      );
  }
}
```

### Step 4: Update Auth Routes

```typescript
// apps/api/src/auth/routes.ts

import { hashToken } from '../utils/jwt';
import { RefreshTokenRepository } from './refresh-token-repository';

// Update login endpoint
authRoutes.post('/login', async (c) => {
  // ... existing authentication ...
  
  const accessToken = createAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
  });
  
  const refreshToken = createRefreshToken({
    userId: user.id,
    tenantId: user.tenantId,
  });
  
  // Store refresh token
  const refreshTokenRepo = container.resolve(RefreshTokenRepository);
  await refreshTokenRepo.create({
    userId: user.id,
    tenantId: user.tenantId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });
  
  return {
    accessToken,
    refreshToken,
    expiresIn: 20 * 60, // 20 minutes in seconds
    user: { ... }
  };
});

// Add refresh endpoint
authRoutes.post('/refresh', async (c) => {
  const body = await c.req.json();
  const { refreshToken } = z.object({
    refreshToken: z.string(),
  }).parse(body);
  
  // Verify refresh token
  let claims;
  try {
    claims = verifyJWT(refreshToken);
  } catch (error) {
    throw new UnauthorizedError('Invalid refresh token');
  }
  
  if (claims.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }
  
  // Check if refresh token exists and is valid
  const refreshTokenRepo = container.resolve(RefreshTokenRepository);
  const tokenHash = hashToken(refreshToken);
  const storedToken = await refreshTokenRepo.findByHash(tokenHash);
  
  if (!storedToken) {
    throw new UnauthorizedError('Refresh token not found or revoked');
  }
  
  // Update last used
  await refreshTokenRepo.updateLastUsed(storedToken.id);
  
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

// Add logout endpoint (revoke refresh token)
authRoutes.post('/logout', async (c) => {
  const requestHeader = getRequestHeader(c);
  const body = await c.req.json();
  const { refreshToken } = z.object({
    refreshToken: z.string().optional(),
  }).parse(body);
  
  const refreshTokenRepo = container.resolve(RefreshTokenRepository);
  
  if (refreshToken) {
    // Revoke specific token
    const tokenHash = hashToken(refreshToken);
    const storedToken = await refreshTokenRepo.findByHash(tokenHash);
    if (storedToken) {
      await refreshTokenRepo.revoke(storedToken.id);
    }
  } else {
    // Revoke all tokens for user
    await refreshTokenRepo.revokeAllForUser(
      requestHeader.userId,
      requestHeader.tenantId
    );
  }
  
  return { success: true };
});
```

### Step 5: Client-Side Auto-Refresh

```typescript
// packages/clients/src/base-client.ts

export class BaseClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;
  
  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }
  
  protected async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    // Ensure we have a valid access token
    await this.ensureValidToken();
    
    // Make request
    let response = await fetch(`${this.baseUrl}${url}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    // If token expired, refresh and retry once
    if (response.status === 401 && this.refreshToken) {
      await this.refreshAccessToken();
      response = await fetch(`${this.baseUrl}${url}`, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    }
    
    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  private async ensureValidToken(): Promise<void> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }
    
    // Check if token is about to expire (within 2 minutes)
    const decoded = this.decodeToken(this.accessToken);
    if (decoded && decoded.exp && decoded.exp * 1000 < Date.now() + 2 * 60 * 1000) {
      await this.refreshAccessToken();
    }
  }
  
  private async refreshAccessToken(): Promise<void> {
    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    
    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to refresh token');
        }
        
        const data = await response.json();
        this.accessToken = data.data.accessToken;
        return this.accessToken;
      } finally {
        this.refreshPromise = null;
      }
    })();
    
    return this.refreshPromise;
  }
  
  private decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch {
      return null;
    }
  }
}
```

## Summary

**Current Implementation:**
- ✅ Tokens expire after 20 minutes
- ❌ No auto-extension
- User must login again when token expires

**With Refresh Tokens:**
- ✅ Access tokens expire after 20 minutes
- ✅ Refresh tokens expire after 7 days
- ✅ Auto-refresh before expiration
- ✅ Can revoke refresh tokens (logout)

**To implement:** Follow steps above. Requires database migration and client updates.
