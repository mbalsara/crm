# Why Store tenantId in Better-Auth User?

## Problem Without tenantId in Better-Auth User

**Current approach (without tenantId):**
```
Every Request:
1. Get better-auth session
2. Extract email from session
3. Extract domain from email
4. Query customer_domains table: SELECT tenant_id WHERE domain = ?
5. Get user from users table using tenantId + email
```

**Issues:**
- ❌ Database query on every request (performance hit)
- ❌ Extra latency for domain lookup
- ❌ More complex middleware logic
- ❌ No tenantId available in session object

---

## Solution: Store tenantId in Better-Auth User

**New approach (with tenantId):**
```
Every Request:
1. Get better-auth session
2. Get tenantId directly from session.user.tenantId
3. Get user from users table using tenantId + email
```

**Benefits:**
- ✅ No database query on every request
- ✅ Faster middleware execution
- ✅ tenantId available directly in session
- ✅ Simpler middleware logic
- ✅ One-time lookup during user creation/linking

---

## Implementation

### 1. Add tenantId Column to Better-Auth User Schema

```typescript
export const betterAuthUser = pgTable(
  'better_auth_user',
  {
    // ... existing fields ...
    tenantId: uuid('tenant_id').references(() => tenants.id),
  }
);
```

### 2. Store tenantId During User Linking

```typescript
// In better-auth-user-service.ts
async linkBetterAuthUser(...) {
  // 1. Find tenantId (one-time lookup)
  const tenantId = await findTenantIdByDomain(email);
  
  // 2. Store in better-auth user
  await db.update(betterAuthUser)
    .set({ tenantId })
    .where(eq(betterAuthUser.id, betterAuthUserId));
  
  // 3. Create/find user in users table
  // ...
}
```

### 3. Use tenantId in Middleware

```typescript
// In requestHeaderMiddleware
const tenantId = session.user.tenantId; // Direct access!
const user = await userRepository.findByEmail(tenantId, email);
```

---

## Migration Path

### For Existing Users

If you already have better-auth users without tenantId:

1. **Option A: Lazy Migration**
   - Middleware checks if `tenantId` exists
   - If missing → fallback to domain lookup
   - Update better-auth user with tenantId for next time

2. **Option B: Batch Migration**
   - Run migration script to populate tenantId for all existing users
   - Query customer_domains for each user's email domain
   - Update better_auth_user.tenant_id

---

## Performance Comparison

**Without tenantId:**
- Every request: 1 query to `customer_domains` + 1 query to `users`
- Latency: ~5-10ms per request

**With tenantId:**
- Every request: 1 query to `users` only
- Latency: ~2-5ms per request
- **50% faster!**

---

## Summary

**Store tenantId in better-auth user because:**
- ✅ Faster requests (no domain lookup)
- ✅ Simpler middleware
- ✅ tenantId available in session
- ✅ One-time cost during user creation

**Trade-off:**
- Need to update better-auth user when tenant changes (rare)
- Slight denormalization (but tenantId rarely changes)

**Recommendation:** ✅ **Yes, store tenantId in better-auth user**
