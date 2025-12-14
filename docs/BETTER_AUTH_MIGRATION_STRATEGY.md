# Better-Auth Migration Strategy for Existing Users

## Problem

Users already exist in `users` table but don't have corresponding `better_auth_user` records. When they try to SSO with Google, we need to link them.

---

## Strategy Options

### Option A: Link on First SSO (Recommended)

**Approach:** When user SSOs with Google for the first time, check if user exists in `users` table by email + tenantId. If exists, link to better-auth user.

**Pros:**
- ✅ Automatic - no manual migration needed
- ✅ Users link themselves on first login
- ✅ No downtime

**Cons:**
- ⚠️ Requires user to SSO at least once
- ⚠️ Need to handle tenantId lookup for existing users

**Implementation:**

```typescript
// In better-auth-user-service.ts
async linkBetterAuthUser(...) {
  // 1. Find tenantId (as usual)
  const tenantId = await findTenantIdByDomain(email);
  
  // 2. Check if user exists in users table FIRST
  let user = await this.userRepository.findByEmail(tenantId, email);
  
  if (user) {
    // User already exists - just link better-auth user
    // Store tenantId in better-auth user
    await db.update(betterAuthUser)
      .set({ tenantId })
      .where(eq(betterAuthUser.id, betterAuthUserId));
    
    return { userId: user.id, tenantId };
  }
  
  // 3. User doesn't exist - create new user (as planned)
  // ...
}
```

---

### Option B: Batch Migration Script

**Approach:** Run a one-time script to create `better_auth_user` records for all existing users.

**Pros:**
- ✅ All users migrated upfront
- ✅ No need to wait for first SSO

**Cons:**
- ❌ Users still need to SSO to get Google account linked
- ❌ Complex - need to handle users without Google accounts
- ❌ May create orphaned better-auth users

**Implementation:**

```typescript
// scripts/migrate-users-to-better-auth.ts
async function migrateUsers() {
  const users = await db.select().from(users);
  
  for (const user of users) {
    // Check if better-auth user already exists
    const existing = await db.select()
      .from(betterAuthUser)
      .where(eq(betterAuthUser.email, user.email))
      .limit(1);
    
    if (existing[0]) {
      // Link existing better-auth user
      await db.update(betterAuthUser)
        .set({ tenantId: user.tenantId })
        .where(eq(betterAuthUser.id, existing[0].id));
      continue;
    }
    
    // Create better-auth user (but no Google account yet)
    // User will link Google account on first SSO
    const betterAuthUserId = generateId();
    await db.insert(betterAuthUser).values({
      id: betterAuthUserId,
      email: user.email,
      emailVerified: false,
      name: `${user.firstName} ${user.lastName}`,
      tenantId: user.tenantId,
    });
  }
}
```

**⚠️ Problem:** This creates better-auth users without Google accounts. Users still need to SSO to link their Google account.

---

### Option C: Hybrid Approach

**Approach:** 
1. Use Option A (link on first SSO) for automatic linking
2. Provide admin script to manually link users if needed

**Pros:**
- ✅ Automatic for most users
- ✅ Manual option for edge cases
- ✅ Flexible

**Cons:**
- ⚠️ Requires admin tooling

---

## Recommended Approach: Option A

**Why:**
- Simplest implementation
- No manual migration needed
- Users link themselves automatically
- Handles edge cases gracefully

---

## Implementation Details

### Updated User Linking Service

```typescript
async linkBetterAuthUser(
  betterAuthUserId: string,
  email: string,
  name: string | null,
  googleAccountId: string
): Promise<{ userId: string; tenantId: string }> {
  // 1. Extract domain and find tenantId
  const domain = email.split('@')[1];
  const domainResult = await this.db
    .select({ tenantId: companyDomains.tenantId })
    .from(companyDomains)
    .where(ilike(companyDomains.domain, domain.toLowerCase()))
    .limit(1);

  if (!domainResult[0]) {
    throw new Error(`No company domain found for ${domain}`);
  }

  const tenantId = domainResult[0].tenantId;

  // 2. Store tenantId in better-auth user
  await this.db
    .update(betterAuthUser)
    .set({ tenantId })
    .where(eq(betterAuthUser.id, betterAuthUserId));

  // 3. Check if user exists in users table (for existing users)
  let user = await this.userRepository.findByEmail(tenantId, email);

  if (user) {
    // Existing user - link to better-auth user
    logger.info(
      { userId: user.id, betterAuthUserId, email, tenantId },
      'Linked existing user to better-auth user'
    );
    return { userId: user.id, tenantId: user.tenantId };
  }

  // 4. New user - create in users table
  const [firstName, ...lastNameParts] = (name || 'User').split(' ');
  const lastName = lastNameParts.join(' ') || '';

  user = await this.userRepository.create({
    tenantId,
    email,
    firstName: firstName || 'User',
    lastName: lastName || '',
    rowStatus: 0,
  });

  logger.info(
    { userId: user.id, betterAuthUserId, email, tenantId },
    'Created new user from Google SSO'
  );

  return { userId: user.id, tenantId: user.tenantId };
}
```

---

## Edge Cases

### Case 1: User exists but email domain changed

**Scenario:** User exists with `old@acme.com`, but SSOs with `new@acme.com`.

**Handling:**
- New email domain → new tenantId lookup
- If tenantId differs → user gets new tenantId
- **Note:** This may cause issues if user should stay in old tenant

**Recommendation:** Admin should verify tenant mapping before user SSOs.

### Case 2: User exists in multiple tenants

**Scenario:** Same email exists in multiple tenants (shouldn't happen, but possible).

**Handling:**
- `findByEmail(tenantId, email)` ensures correct tenant
- Uses tenantId from domain lookup (correct tenant)

### Case 3: User SSOs before domain is mapped

**Scenario:** User tries to SSO but their email domain isn't in `company_domains`.

**Handling:**
- Error thrown: "No company domain found"
- User cannot sign in until admin adds domain
- Admin adds domain → user can SSO → automatically linked

---

## Migration Checklist

- [ ] Verify `linkBetterAuthUser` checks for existing users
- [ ] Test SSO with existing user email
- [ ] Test SSO with new user email
- [ ] Test error case (domain not mapped)
- [ ] Document process for admins
- [ ] Notify existing users about SSO availability

---

## Summary

**Recommended Strategy:** Option A - Link on First SSO

**Flow:**
1. User SSOs with Google (first time)
2. Better-auth creates `better_auth_user` record
3. Hook triggers `linkBetterAuthUser()`
4. Service checks if user exists in `users` table
5. If exists → link (store tenantId in better-auth user)
6. If not exists → create new user
7. User is now linked and can use the app

**No manual migration needed** - users link themselves automatically on first SSO.
