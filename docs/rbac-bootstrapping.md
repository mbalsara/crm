# RBAC Bootstrapping Approaches

## The Problem

When a new tenant is created, there are no users yet. The first user who logs in via SSO needs to be assigned the Administrator role, but:
- We don't know who the first user will be ahead of time
- Without an admin, no one can assign roles to users
- The system needs at least one admin to function

## Approach 1: First User is Admin

**How it works:** The first user to log in to a new tenant automatically gets the Administrator role.

**Pros:**
- Simple to implement
- No manual intervention required
- Works for self-service tenant provisioning

**Cons:**
- Security risk - anyone with access to SSO could become admin
- No control over who becomes admin
- Race condition if multiple users log in simultaneously

**Implementation:**
```typescript
// In user creation flow (SSO callback)
const userCount = await userRepository.countByTenant(tenantId);
if (userCount === 0) {
  // First user - assign Administrator role
  const adminRole = await roleRepository.findByName(tenantId, 'Administrator');
  newUser.roleId = adminRole.id;
} else {
  // Subsequent users - assign User role
  const userRole = await roleRepository.findByName(tenantId, 'User');
  newUser.roleId = userRole.id;
}
```

---

## Approach 2: Designated Admin Email

**How it works:** When creating a tenant, specify the admin email. That user gets Administrator role on first login.

**Pros:**
- Explicit control over who becomes admin
- Secure - only designated email gets admin access
- Works well for enterprise onboarding

**Cons:**
- Requires knowing admin email upfront
- Need UI/API to set designated admin during tenant creation
- What if designated admin never logs in?

**Implementation:**
```sql
-- Add to tenants table
ALTER TABLE tenants ADD COLUMN admin_email VARCHAR(255);
```

```typescript
// In user creation flow
if (user.email === tenant.adminEmail) {
  const adminRole = await roleRepository.findByName(tenantId, 'Administrator');
  newUser.roleId = adminRole.id;
} else {
  const userRole = await roleRepository.findByName(tenantId, 'User');
  newUser.roleId = userRole.id;
}
```

---

## Approach 3: Invitation-Based

**How it works:** Tenant creator sends an admin invitation link. The invited user gets Administrator role.

**Pros:**
- Very secure - requires explicit invitation
- Audit trail of who invited whom
- Can have multiple initial admins

**Cons:**
- More complex to implement
- Requires invitation/token system
- Chicken-and-egg: who creates the first invitation?

**Implementation:**
- Create `invitations` table with role, email, token, expiry
- Super-admin or system creates first invitation
- User clicks link, logs in via SSO, gets assigned role from invitation

---

## Approach 4: Domain-Based Admin Rules

**How it works:** Configure rules like "users matching *@company.com with title containing 'CEO' get admin".

**Pros:**
- Flexible rules engine
- Can auto-promote based on user attributes
- Works with SSO claims (title, department, etc.)

**Cons:**
- Complex to configure
- Relies on accurate SSO data
- May not work for all SSO providers

---

## Approach 5: Super-Admin Seeding

**How it works:** A super-admin (platform operator) manually assigns the first tenant admin.

**Pros:**
- Full control
- Works for managed/enterprise deployments
- Clear accountability

**Cons:**
- Manual process
- Doesn't scale for self-service
- Requires super-admin infrastructure

**Implementation:**
```sql
-- Super-admin runs this after tenant creation
UPDATE users
SET role_id = (SELECT id FROM roles WHERE tenant_id = ? AND name = 'Administrator')
WHERE tenant_id = ? AND email = 'admin@customer.com';
```

---

## Approach 6: Claim-Based from SSO

**How it works:** SSO provider includes role/admin claim. System trusts this claim for role assignment.

**Pros:**
- Leverages existing identity infrastructure
- Customer controls their own admins
- No separate role management needed

**Cons:**
- Requires SSO configuration on customer side
- Not all SSO providers support custom claims
- Tight coupling to SSO provider

**Implementation:**
```typescript
// In SSO callback, check claims
const isAdmin = ssoProfile.claims['is_admin'] === true
  || ssoProfile.groups?.includes('CRM-Admins');

if (isAdmin) {
  newUser.roleId = adminRole.id;
}
```

---

## Recommended Approach

For our use case, **Approach 2 (Designated Admin Email)** is recommended:

1. When creating a tenant (via API or super-admin UI), require `adminEmail` field
2. Store `admin_email` on the tenant record
3. When that user logs in via SSO, automatically assign Administrator role
4. All other users get the default User role
5. Once logged in, the admin can promote other users via UI

**Fallback:** Combine with Approach 5 - super-admin can manually promote users if needed.

---

## Database Changes Required

```sql
-- Option: Add admin_email to tenants
ALTER TABLE tenants ADD COLUMN admin_email VARCHAR(255);

-- Option: Add admin_emails array for multiple initial admins
ALTER TABLE tenants ADD COLUMN admin_emails VARCHAR(255)[];
```

## Migration Path

1. For existing tenants: Super-admin manually sets `admin_email` or directly updates user roles
2. For new tenants: Require `admin_email` during tenant creation
3. SSO callback checks if user email matches `admin_email` and assigns role accordingly
