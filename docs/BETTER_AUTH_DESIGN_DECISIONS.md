# Better-Auth Design Decisions

## Approved Design Decisions ✅

### 1. Store `tenantId` in Better-Auth User Table

**Decision:** Add `tenant_id UUID` column to `better_auth_user` table.

**Rationale:**
- Fast lookup in middleware (no query to `company_domains` on every request)
- ~50% faster middleware execution
- tenantId available directly in session object

**Implementation:**
- Add `tenantId: uuid('tenant_id')` to `betterAuthUser` schema
- Store during user creation/linking (one-time lookup)
- Read directly from `session.user.tenantId` in middleware

---

### 2. No Fallback for Missing `tenantId`

**Decision:** If `tenantId` is missing from better-auth user → throw error.

**Rationale:**
- Strict validation ensures users have proper tenant mapping
- Prevents users from accessing wrong tenant data
- Forces admin to properly configure company domains

**Implementation:**
- Middleware checks: `if (!tenantId) throw UnauthorizedError`
- Error message: "User tenant not configured. Please contact support to map your email domain to a company."
- No fallback to `DEFAULT_TENANT_ID` or domain lookup

---

### 3. No Auto-Update of `tenantId`

**Decision:** If user's email domain changes → don't automatically update `tenantId`.

**Rationale:**
- Prevents accidental tenant switching
- Requires explicit admin action to change tenant
- Maintains data integrity

**Implementation:**
- Don't update `better_auth_user.tenant_id` if email domain changes
- Admin must manually update tenant mapping if needed
- Or create new better-auth user account

---

### 4. Automatic User Provisioning

**Decision:** On first Google SSO → automatically create user in `users` table.

**Rationale:**
- Seamless onboarding experience
- No manual user creation required
- User is immediately available after first SSO

**Implementation:**
- Hook `after.signIn` or `after.user.created` triggers
- Extract `firstName`/`lastName` from Google `name` field
- Create user with:
  - `tenantId` (from domain lookup)
  - `email` (from Google)
  - `firstName`/`lastName` (parsed from Google name)
  - `rowStatus = 0` (active)
- Link via email (unique per tenant)

**Flow:**
```
1. User SSOs with Google (first time)
2. Better-auth creates user in better_auth_user table
3. Hook triggers linkBetterAuthUser()
4. Extract domain → find tenantId → store in better_auth_user.tenant_id
5. Check if user exists in users table
6. If not exists → automatically create user in users table
7. User is now provisioned and ready to use
```

---

## Summary

| Decision | Action | Rationale |
|----------|--------|------------|
| Store tenantId | ✅ Add column to better_auth_user | Fast lookup, better performance |
| Missing tenantId | ❌ Throw error (no fallback) | Strict validation, data integrity |
| Domain changes | ❌ Don't auto-update | Prevent accidental tenant switching |
| User provisioning | ✅ Auto-create on SSO | Seamless onboarding |

---

## Implementation Impact

### What This Means:

1. **Stricter Requirements:**
   - Company domains must be mapped before users can SSO
   - Admin must add domains to `company_domains` table first

2. **Better Performance:**
   - No `company_domains` query on every request
   - Faster middleware execution

3. **Simpler Code:**
   - No fallback logic needed
   - Direct tenantId access from session

4. **Automatic Onboarding:**
   - Users are automatically created on first SSO
   - No manual user creation required

---

## Edge Cases Handled

### Case 1: User SSOs but domain not mapped
- **Result:** Error thrown during user linking
- **Action:** Admin must add domain to `company_domains` table
- **User Impact:** Cannot sign in until domain is mapped

### Case 2: User changes email domain
- **Result:** tenantId remains unchanged
- **Action:** Admin must manually update tenant mapping if needed
- **User Impact:** May need to contact admin if tenant should change

### Case 3: User SSOs second time
- **Result:** Existing user found, no duplicate created
- **Action:** Link better-auth user to existing user
- **User Impact:** Seamless, no issues

### Case 4: Multiple users with same email domain
- **Result:** All users get same tenantId (from company_domains)
- **Action:** Works as expected
- **User Impact:** All users in same tenant (correct behavior)

---

## Next Steps

1. ✅ Design decisions approved
2. ⏳ Wait for go-ahead to implement
3. ⏳ Implement according to approved design
4. ⏳ Test edge cases
5. ⏳ Deploy
