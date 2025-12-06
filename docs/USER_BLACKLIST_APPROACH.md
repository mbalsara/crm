# User Blacklist Approach for Token Invalidation

## Overview

Instead of tracking token versions or blacklisting individual tokens, we can **blacklist users**. When a user is blacklisted, they must re-authenticate. After successful authentication, they're automatically removed from the blacklist.

## How It Works

### Flow

```
1. User logs in
   ↓
2. Check if user is blacklisted
   ↓
3a. If blacklisted → Deny login, return error
3b. If not blacklisted → Issue JWT token
   ↓
4. On every API request → Check if user is blacklisted
   ↓
5a. If blacklisted → Reject request (401 Unauthorized)
5b. If not blacklisted → Process request
   ↓
6. After successful re-authentication → Remove from blacklist
```

## Database Schema

```sql
CREATE TABLE user_blacklist (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  blacklisted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason VARCHAR(255),  -- 'security_breach', 'admin_action', 'suspicious_activity'
  blacklisted_by UUID REFERENCES users(id),  -- Admin who blacklisted
  
  INDEX idx_tenant_user (tenant_id, user_id)
);
```

## Implementation

### 1. Check Blacklist on Login

```typescript
// apps/api/src/auth/auth-service.ts
import { eq, and } from 'drizzle-orm';
import { userBlacklist } from './user-blacklist-schema';

export async function login(
  email: string,
  password: string,
  tenantId: string
): Promise<{ token: string; user: User }> {
  // 1. Authenticate user
  const user = await userRepository.findByEmail(tenantId, email);
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    throw new UnauthorizedError('Invalid credentials');
  }
  
  // 2. Check if user is blacklisted
  const [blacklisted] = await db
    .select()
    .from(userBlacklist)
    .where(
      and(
        eq(userBlacklist.userId, user.id),
        eq(userBlacklist.tenantId, tenantId)
      )
    )
    .limit(1);
  
  if (blacklisted) {
    throw new UnauthorizedError(
      'Account has been disabled. Please contact support.',
      { code: 'ACCOUNT_BLACKLISTED' }
    );
  }
  
  // 3. Issue JWT token
  const token = await createJWT(user.id, tenantId);
  
  return { token, user };
}
```

### 2. Check Blacklist on Every Request

```typescript
// apps/api/src/middleware/requestHeader.ts
export async function requestHeaderMiddleware(c: Context, next: Next) {
  // 1. Extract and verify JWT token
  const token = extractToken(c);
  const claims = await verifyJWT(token);
  
  // 2. Check if user is blacklisted
  const db = container.resolve('Database');
  const [blacklisted] = await db
    .select()
    .from(userBlacklist)
    .where(
      and(
        eq(userBlacklist.userId, claims.userId),
        eq(userBlacklist.tenantId, claims.tenantId)
      )
    )
    .limit(1);
  
  if (blacklisted) {
    throw new UnauthorizedError(
      'Your account has been disabled. Please log in again.',
      { code: 'ACCOUNT_BLACKLISTED' }
    );
  }
  
  // 3. Create RequestHeader
  const requestHeader: RequestHeader = {
    tenantId: claims.tenantId,
    userId: claims.userId,
  };
  
  c.set('requestHeader', requestHeader);
  await next();
}
```

### 3. Remove from Blacklist After Re-Auth

```typescript
// apps/api/src/auth/auth-service.ts
export async function login(
  email: string,
  password: string,
  tenantId: string
): Promise<{ token: string; user: User }> {
  // ... authenticate user ...
  
  // Check blacklist
  const [blacklisted] = await db
    .select()
    .from(userBlacklist)
    .where(
      and(
        eq(userBlacklist.userId, user.id),
        eq(userBlacklist.tenantId, tenantId)
      )
    )
    .limit(1);
  
  if (blacklisted) {
    // Remove from blacklist after successful authentication
    await db
      .delete(userBlacklist)
      .where(
        and(
          eq(userBlacklist.userId, user.id),
          eq(userBlacklist.tenantId, tenantId)
        )
      );
    
    // Now issue token
    const token = await createJWT(user.id, tenantId);
    return { token, user };
  }
  
  // Normal flow - user not blacklisted
  const token = await createJWT(user.id, tenantId);
  return { token, user };
}
```

**Wait - this doesn't make sense!** If they're blacklisted, we shouldn't let them log in. Let me reconsider...

### Alternative: Blacklist Removal Requires Admin Action

Actually, the user's suggestion might be:
- User is blacklisted → Can't use existing tokens
- User tries to log in → Still blacklisted, login fails
- **Admin removes from blacklist** → User can now log in again

OR:

- User is blacklisted → Can't use existing tokens
- User tries to log in → **If login succeeds, remove from blacklist** (as a security measure - if they can prove identity, they're allowed back)

Let me provide both approaches:

---

## Approach A: Blacklist Blocks Login (Recommended)

**User must be removed from blacklist by admin before they can log in again.**

```typescript
export async function login(
  email: string,
  password: string,
  tenantId: string
): Promise<{ token: string; user: User }> {
  // 1. Authenticate
  const user = await userRepository.findByEmail(tenantId, email);
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    throw new UnauthorizedError('Invalid credentials');
  }
  
  // 2. Check blacklist - if blacklisted, deny login
  const [blacklisted] = await db
    .select()
    .from(userBlacklist)
    .where(
      and(
        eq(userBlacklist.userId, user.id),
        eq(userBlacklist.tenantId, tenantId)
      )
    )
    .limit(1);
  
  if (blacklisted) {
    throw new UnauthorizedError(
      'Account has been disabled. Please contact support.',
      { code: 'ACCOUNT_BLACKLISTED', reason: blacklisted.reason }
    );
  }
  
  // 3. Issue token
  const token = await createJWT(user.id, tenantId);
  return { token, user };
}
```

**Admin removes from blacklist:**
```typescript
// apps/api/src/users/service.ts
async removeFromBlacklist(
  tenantId: string,
  userId: string,
  adminUserId: string
): Promise<void> {
  await db
    .delete(userBlacklist)
    .where(
      and(
        eq(userBlacklist.userId, userId),
        eq(userBlacklist.tenantId, tenantId)
      )
    );
  
  logger.info(
    { tenantId, userId, adminUserId },
    'User removed from blacklist'
  );
}
```

---

## Approach B: Auto-Remove on Successful Login

**If user can successfully authenticate, remove them from blacklist (they've proven identity).**

```typescript
export async function login(
  email: string,
  password: string,
  tenantId: string
): Promise<{ token: string; user: User; wasBlacklisted: boolean }> {
  // 1. Authenticate
  const user = await userRepository.findByEmail(tenantId, email);
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    throw new UnauthorizedError('Invalid credentials');
  }
  
  // 2. Check blacklist
  const [blacklisted] = await db
    .select()
    .from(userBlacklist)
    .where(
      and(
        eq(userBlacklist.userId, user.id),
        eq(userBlacklist.tenantId, tenantId)
      )
    )
    .limit(1);
  
  const wasBlacklisted = !!blacklisted;
  
  // 3. If blacklisted, remove them (they've proven identity)
  if (blacklisted) {
    await db
      .delete(userBlacklist)
      .where(
        and(
          eq(userBlacklist.userId, user.id),
          eq(userBlacklist.tenantId, tenantId)
        )
      );
    
    logger.info(
      { tenantId, userId: user.id },
      'User removed from blacklist after successful authentication'
    );
  }
  
  // 4. Issue token
  const token = await createJWT(user.id, tenantId);
  return { token, user, wasBlacklisted };
}
```

---

## Use Cases

### 1. Security Breach Detection

```typescript
// Auto-blacklist user after suspicious activity
async detectSuspiciousActivity(userId: string, tenantId: string): Promise<void> {
  await db.insert(userBlacklist).values({
    userId,
    tenantId,
    reason: 'suspicious_activity',
    blacklistedBy: null, // System action
  }).onConflictDoNothing();
  
  // All existing tokens immediately invalid
  // User must re-authenticate
}
```

### 2. Admin Action

```typescript
// Admin disables user account
async blacklistUser(
  tenantId: string,
  userId: string,
  adminUserId: string,
  reason: string
): Promise<void> {
  await db.insert(userBlacklist).values({
    userId,
    tenantId,
    reason,
    blacklistedBy: adminUserId,
  }).onConflictDoUpdate({
    set: {
      reason,
      blacklistedBy: adminUserId,
      blacklistedAt: new Date(),
    },
  });
}
```

### 3. Password Change (Optional)

```typescript
// Optionally blacklist user on password change
async changePassword(
  userId: string,
  tenantId: string,
  newPassword: string
): Promise<void> {
  await db.transaction(async (tx) => {
    // Update password
    await tx.update(users)
      .set({ passwordHash: await hashPassword(newPassword) })
      .where(and(
        eq(users.id, userId),
        eq(users.tenantId, tenantId)
      ));
    
    // Blacklist user (forces re-auth with new password)
    await tx.insert(userBlacklist).values({
      userId,
      tenantId,
      reason: 'password_change',
    }).onConflictDoNothing();
  });
}
```

---

## Performance Considerations

### Caching Blacklist Status

To avoid database lookup on every request:

```typescript
// Simple in-memory cache
const blacklistCache = new Map<string, { blacklisted: boolean; expiresAt: number }>();

async function isUserBlacklisted(userId: string, tenantId: string): Promise<boolean> {
  const cacheKey = `${tenantId}:${userId}`;
  const cached = blacklistCache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.blacklisted;
  }
  
  // Check database
  const [blacklisted] = await db
    .select()
    .from(userBlacklist)
    .where(
      and(
        eq(userBlacklist.userId, userId),
        eq(userBlacklist.tenantId, tenantId)
      )
    )
    .limit(1);
  
  const isBlacklisted = !!blacklisted;
  
  // Cache for 1 minute
  blacklistCache.set(cacheKey, {
    blacklisted: isBlacklisted,
    expiresAt: Date.now() + 60000,
  });
  
  return isBlacklisted;
}
```

**Cache invalidation:**
- When user is blacklisted → Invalidate cache
- When user is removed from blacklist → Invalidate cache
- Cache expires after 1-5 minutes (safety net)

---

## Comparison with Token Version Approach

| Aspect | User Blacklist | Token Version |
|--------|----------------|---------------|
| **Granularity** | All tokens for user | All tokens for user |
| **Storage** | One row per blacklisted user | One integer per user |
| **Performance** | DB lookup (can cache) | DB lookup (can cache) |
| **Use Cases** | Security breach, admin action | Password change, security breach |
| **Re-auth Required** | Yes (if Approach A) | No (if just password change) |
| **Complexity** | Simple | Simple |

**Key Difference:**
- **User Blacklist**: User must re-authenticate to get new token
- **Token Version**: Existing tokens invalid, but can issue new token immediately (if not blacklisted)

---

## Recommended Approach

**Use User Blacklist for:**
- Security breach detection
- Admin disabling accounts
- Suspicious activity

**Use Token Version for:**
- Password changes (don't require re-auth, just invalidate old tokens)
- Bulk token invalidation

**Or combine both:**
- User blacklist for security/admin actions
- Token version for password changes

---

## Summary

**User blacklist approach:**
- ✅ Simple to implement
- ✅ Works without Redis
- ✅ Can cache blacklist status
- ✅ Forces re-authentication
- ⚠️ Requires DB lookup (mitigated by caching)
- ⚠️ Less granular than individual token blacklist

**Works well for:**
- Security breach scenarios
- Admin account management
- Suspicious activity detection

**Doesn't work well for:**
- Individual token revocation (logout) - would invalidate all tokens
- Password changes where you want to keep user logged in
