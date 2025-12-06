# JWT Token Invalidation Strategy

## Overview

This document explains how JWT token invalidation works in our CRM system, especially when **not using Redis** for session management.

## JWT Token Basics

### How JWTs Work (Stateless)

JWTs are **stateless** tokens that contain all necessary information in the token itself:

```typescript
// JWT Payload (claims)
{
  userId: "user-123",
  tenantId: "tenant-456",
  iat: 1234567890,        // Issued at (timestamp)
  exp: 1234571490,         // Expiration (timestamp)
  jti: "token-id-789"      // JWT ID (unique token identifier)
}
```

**Key Points:**
- Token is **self-contained** - no server-side storage needed
- Token is **cryptographically signed** - cannot be tampered with
- Token has **expiration** - automatically invalid after `exp` time
- Token is **stateless** - server doesn't need to look up session

### Current Flow (Without Invalidation)

```
1. User logs in → Server creates JWT with userId, tenantId, exp
2. Client stores JWT (localStorage/cookie)
3. Client sends JWT in Authorization header
4. Server validates signature + expiration
5. Server extracts userId, tenantId from token
6. Request proceeds
```

**Problem:** Once a JWT is issued, it's valid until expiration. There's no way to "revoke" it without server-side tracking.

---

## Token Invalidation Strategies

### Strategy 1: Token Blacklist (Database Table)

**How it works:**
- Store invalidated tokens in a database table
- Check blacklist on every request
- Tokens remain invalid even if not expired

#### Database Schema

```sql
CREATE TABLE token_blacklist (
  jti UUID PRIMARY KEY,              -- JWT ID (from token)
  tenant_id UUID NOT NULL,            -- For efficient queries
  user_id UUID NOT NULL,              -- For efficient queries
  invalidated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,   -- When token would expire
  reason VARCHAR(100),                -- 'logout', 'password_change', 'security_breach'
  
  INDEX idx_tenant_user (tenant_id, user_id),
  INDEX idx_expires_at (expires_at)   -- For cleanup
);
```

#### Implementation

**1. Include `jti` (JWT ID) in token:**

```typescript
// apps/api/src/utils/auth.ts
import { v7 as uuidv7 } from 'uuid';
import jwt from 'jsonwebtoken';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  jti: string;              // JWT ID - unique per token
  iat: number;
  exp: number;
  email?: string;
}

export function createJWT(payload: Omit<JWTPayload, 'jti' | 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = process.env.JWT_EXPIRES_IN || '1h'; // e.g., '1h', '24h'
  
  return jwt.sign(
    {
      ...payload,
      jti: uuidv7(),                    // Unique token ID
      iat: now,
    },
    process.env.JWT_SECRET!,
    {
      expiresIn,
      issuer: 'crm-api',
    }
  );
}
```

**2. Check blacklist in middleware:**

```typescript
// apps/api/src/middleware/requestHeader.ts
import { eq, and, gte } from 'drizzle-orm';
import { tokenBlacklist } from '../auth/token-blacklist-schema';
import { verifyJWT } from '../utils/auth';

export async function requestHeaderMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }
  
  const token = authHeader.substring(7);
  
  // 1. Verify JWT signature and expiration
  let claims: JWTPayload;
  try {
    claims = await verifyJWT(token);
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired token');
  }
  
  // 2. Check if token is blacklisted
  const db = container.resolve('Database');
  const [blacklisted] = await db
    .select()
    .from(tokenBlacklist)
    .where(
      and(
        eq(tokenBlacklist.jti, claims.jti!),
        gte(tokenBlacklist.expiresAt, new Date()) // Only check if not expired
      )
    )
    .limit(1);
  
  if (blacklisted) {
    throw new UnauthorizedError('Token has been revoked');
  }
  
  // 3. Extract RequestHeader
  const requestHeader: RequestHeader = {
    tenantId: claims.tenantId,
    userId: claims.userId,
  };
  
  c.set('requestHeader', requestHeader);
  await next();
}
```

**3. Invalidate token (logout, password change, etc.):**

```typescript
// apps/api/src/auth/token-service.ts
import { injectable, inject } from 'tsyringe';
import type { Database } from '@crm/database';
import { tokenBlacklist } from './token-blacklist-schema';
import { decode } from 'jsonwebtoken';

@injectable()
export class TokenService {
  constructor(@inject('Database') private db: Database) {}
  
  /**
   * Invalidate a single token (e.g., on logout)
   */
  async invalidateToken(token: string, reason: string = 'logout'): Promise<void> {
    const decoded = decode(token) as JWTPayload | null;
    if (!decoded?.jti || !decoded.exp) {
      return; // Invalid token format
    }
    
    await this.db.insert(tokenBlacklist).values({
      jti: decoded.jti,
      tenantId: decoded.tenantId,
      userId: decoded.userId,
      expiresAt: new Date(decoded.exp * 1000), // Convert to Date
      reason,
    }).onConflictDoNothing(); // Idempotent
  }
  
  /**
   * Invalidate all tokens for a user (e.g., password change)
   */
  async invalidateAllUserTokens(
    tenantId: string,
    userId: string,
    reason: string = 'password_change'
  ): Promise<void> {
    // Note: We can't blacklist tokens we haven't seen yet.
    // Instead, we track a "token version" or "password changed at" timestamp.
    // See Strategy 2 for better approach.
  }
  
  /**
   * Invalidate all tokens for a tenant (e.g., security breach)
   */
  async invalidateAllTenantTokens(
    tenantId: string,
    reason: string = 'security_breach'
  ): Promise<void> {
    // Similar limitation - see Strategy 2
  }
}
```

**Limitations:**
- ❌ Can't invalidate tokens we haven't seen (can't blacklist future tokens)
- ❌ Requires database lookup on every request (performance impact)
- ❌ Blacklist grows over time (needs cleanup)

---

### Strategy 2: Token Version / Password Changed At (Recommended)

**How it works:**
- Store a "token version" or "password changed at" timestamp in user record
- Include this version/timestamp in JWT
- On password change, increment version
- On request, compare token version with user version
- If mismatch → token invalid

#### Database Schema

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;

-- Index for efficient lookups
CREATE INDEX idx_users_token_version ON users(tenant_id, id, token_version);
```

#### Implementation

**1. Include token version in JWT:**

```typescript
// apps/api/src/utils/auth.ts
export interface JWTPayload {
  userId: string;
  tenantId: string;
  tokenVersion: number;    // From users.token_version
  iat: number;
  exp: number;
}

export async function createJWT(
  userId: string,
  tenantId: string
): Promise<string> {
  // Get current token version from database
  const user = await getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  return jwt.sign(
    {
      userId,
      tenantId,
      tokenVersion: user.tokenVersion,  // Include version
      iat: now,
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: '1h',
      issuer: 'crm-api',
    }
  );
}
```

**2. Validate token version in middleware:**

```typescript
// apps/api/src/middleware/requestHeader.ts
export async function requestHeaderMiddleware(c: Context, next: Next) {
  // ... verify JWT signature ...
  
  const claims = await verifyJWT(token);
  
  // Check token version matches user's current version
  const userRepository = container.resolve(UserRepository);
  const user = await userRepository.findById(claims.userId);
  
  if (!user || user.tokenVersion !== claims.tokenVersion) {
    throw new UnauthorizedError('Token has been invalidated');
  }
  
  // ... continue ...
}
```

**3. Invalidate all user tokens (password change):**

```typescript
// apps/api/src/users/service.ts
async changePassword(
  tenantId: string,
  userId: string,
  newPassword: string
): Promise<void> {
  await this.db.transaction(async (tx) => {
    // 1. Update password
    await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        tokenVersion: sql`token_version + 1`, // Increment version
      })
      .where(and(
        eq(users.id, userId),
        eq(users.tenantId, tenantId)
      ));
  });
  
  // All existing tokens are now invalid (version mismatch)
}
```

**4. Invalidate all tenant tokens (security breach):**

```typescript
// apps/api/src/tenants/service.ts
async invalidateAllTenantTokens(tenantId: string): Promise<void> {
  // Option A: Increment a tenant-level token version
  await this.db
    .update(tenants)
    .set({
      tokenVersion: sql`token_version + 1`,
    })
    .where(eq(tenants.id, tenantId));
  
  // Option B: Increment all users' token versions
  await this.db
    .update(users)
    .set({
      tokenVersion: sql`token_version + 1`,
    })
    .where(eq(users.tenantId, tenantId));
}
```

**Advantages:**
- ✅ No database lookup on every request (can cache user)
- ✅ Can invalidate all tokens for a user/tenant instantly
- ✅ Works for tokens we haven't seen yet
- ✅ Minimal storage (one integer per user)

**Limitations:**
- ⚠️ Requires database lookup for user (can be cached)
- ⚠️ Can't invalidate individual tokens (only all tokens for a user)

---

### Strategy 3: Hybrid Approach (Best of Both)

**Combine token version + blacklist:**

- Use **token version** for bulk invalidation (password change, security breach)
- Use **blacklist** for individual token invalidation (logout)

```typescript
export async function requestHeaderMiddleware(c: Context, next: Next) {
  // 1. Verify JWT signature
  const claims = await verifyJWT(token);
  
  // 2. Check token version (fast, cached)
  const user = await getUserCached(claims.userId);
  if (!user || user.tokenVersion !== claims.tokenVersion) {
    throw new UnauthorizedError('Token invalidated');
  }
  
  // 3. Check blacklist (only if version matches)
  const blacklisted = await checkBlacklist(claims.jti);
  if (blacklisted) {
    throw new UnauthorizedError('Token revoked');
  }
  
  // ... continue ...
}
```

---

## Recommended Implementation

### For Your Use Case (No Redis)

**Use Strategy 2 (Token Version) + Optional Blacklist:**

1. **Add `token_version` to users table**
2. **Include `tokenVersion` in JWT**
3. **Check version on every request** (can cache user for 1-5 minutes)
4. **Increment version to invalidate all tokens**

### Implementation Steps

**Step 1: Update User Schema**

```typescript
// apps/api/src/users/schema.ts
export const users = pgTable('users', {
  // ... existing fields ...
  tokenVersion: integer('token_version').notNull().default(0),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
});
```

**Step 2: Update JWT Creation**

```typescript
// apps/api/src/auth/auth-service.ts
export async function createJWT(userId: string, tenantId: string): Promise<string> {
  const user = await userRepository.findById(userId);
  if (!user) throw new Error('User not found');
  
  return jwt.sign(
    {
      userId,
      tenantId,
      tokenVersion: user.tokenVersion,
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
}
```

**Step 3: Update Middleware**

```typescript
// apps/api/src/middleware/requestHeader.ts
export async function requestHeaderMiddleware(c: Context, next: Next) {
  const token = extractToken(c);
  const claims = await verifyJWT(token);
  
  // Check token version (with caching)
  const user = await getUserWithCache(claims.userId);
  if (user.tokenVersion !== claims.tokenVersion) {
    throw new UnauthorizedError('Token invalidated');
  }
  
  c.set('requestHeader', {
    tenantId: claims.tenantId,
    userId: claims.userId,
  });
  
  await next();
}
```

**Step 4: Invalidate Tokens**

```typescript
// Invalidate all user tokens (password change)
await userRepository.update(userId, {
  tokenVersion: sql`token_version + 1`,
});

// Invalidate all tenant tokens (security breach)
await db.update(users)
  .set({ tokenVersion: sql`token_version + 1` })
  .where(eq(users.tenantId, tenantId));
```

---

## Performance Considerations

### Caching User Token Version

To avoid database lookup on every request:

```typescript
// Simple in-memory cache (or use Redis if available later)
const userCache = new Map<string, { version: number; expiresAt: number }>();

async function getUserTokenVersion(userId: string): Promise<number> {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.version;
  }
  
  const user = await userRepository.findById(userId);
  const version = user?.tokenVersion ?? 0;
  
  userCache.set(userId, {
    version,
    expiresAt: Date.now() + 60000, // Cache for 1 minute
  });
  
  return version;
}
```

---

## Summary

| Strategy | Use Case | Pros | Cons |
|----------|----------|------|------|
| **Token Version** | Bulk invalidation (password change, security breach) | Fast, no blacklist growth, works for future tokens | Can't invalidate individual tokens |
| **Blacklist** | Individual token invalidation (logout) | Can invalidate specific tokens | Requires DB lookup, blacklist grows |
| **Hybrid** | Both use cases | Best of both worlds | More complex |

**Recommendation:** Start with **Token Version** only. Add blacklist later if you need individual token invalidation.
