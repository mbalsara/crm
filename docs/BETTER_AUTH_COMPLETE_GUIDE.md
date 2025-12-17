# Better-Auth Google SSO - Complete Implementation Guide

## Table of Contents

1. [Current Authentication System](#current-authentication-system)
2. [Better-Auth Integration Strategy](#better-auth-integration-strategy)
3. [Security Considerations](#security-considerations)
4. [Architectural Concerns & Solutions](#architectural-concerns--solutions)
5. [Design Decisions](#design-decisions)
6. [Backend Implementation](#backend-implementation)
7. [Frontend Implementation](#frontend-implementation)
8. [Google Cloud Console Setup](#google-cloud-console-setup)
9. [Migration Strategy](#migration-strategy)
10. [Testing Checklist](#testing-checklist)

---

## Current Authentication System

### Database Schema Context

**Important:** The `employees` table was merged into `users` table. Current state:

**Backend (✅ Already Migrated):**
- ✅ `apps/api/src/users/` - User API routes, services, repositories
- ✅ `sql/users.sql` - Users table (contains all user/employee business logic)
- ✅ No `apps/api/src/employees/` folder
- ✅ API endpoints: `/api/users/*` (not `/api/employees/*`)

**Frontend (⚠️ Still Has Employee UI):**
- ⚠️ `apps/web/app/employees/page.tsx` - Employee page
- ⚠️ `apps/web/components/employees/employee-form.tsx` - Employee form
- ⚠️ `apps/web/components/employees/employee-card.tsx` - Employee card
- ⚠️ `apps/web/components/employees/employee-table.tsx` - Employee table

**With Better-Auth, we'll have:**
- `better_auth_user` - Authentication (managed by better-auth)
- `users` - Business logic (firstName, lastName, rowStatus, tenantId, etc.)

**Total: 2 tables** (not 3)

**Migration Status:**
- ✅ Backend: Complete (employees → users)
- ✅ Frontend: Complete (employee UI → user UI)

**Migration Completed:**
- ✅ Created user components (`user-form.tsx`, `user-card.tsx`, `user-table.tsx`)
- ✅ Created user page (`/users`)
- ✅ Updated types (`Employee` → `User`, kept backwards compatibility)
- ✅ Updated navigation (sidebar, routes)
- ✅ Updated imports and references
- ✅ Deleted old employee files
- ✅ Updated export utilities (`exportUsersToCSV`)
- ✅ Updated import dialog (supports "users" entity type)

**All frontend code now uses "users" terminology consistently.**

### How It Works Now

**Current System:** Custom HMAC-signed session tokens

1. **Session Creation** (`apps/api/src/auth/session.ts`):
   - Creates HMAC-signed session tokens
   - Stores payload: `{ userId, tenantId, expiresAt }`
   - 30-minute expiration with sliding window (refreshes if < 5 mins remaining)

2. **Middleware** (`apps/api/src/middleware/requestHeader.ts`):
   - Checks for token in `Authorization` header OR `session` cookie
   - Verifies HMAC signature
   - Extracts `userId` and `tenantId` from token
   - Sets `RequestHeader` in context

3. **Auth Routes** (`apps/api/src/auth/routes.ts`):
   - `POST /api/auth/login` - Dev-only simple password check, creates session
   - `POST /api/auth/test-token` - Generates indefinite token for testing
   - `GET /api/auth/me` - Returns user details from session
   - `POST /api/auth/logout` - Clears session cookie

4. **Session Storage:**
   - Stateless (HMAC-signed tokens)
   - No database storage
   - Token contains all needed info

### Current Flow

```
User → POST /api/auth/login → Session Token Created → 
Cookie Set → Subsequent Requests → Middleware Validates Token → 
Extracts userId/tenantId → Sets RequestHeader
```

---

## Better-Auth Integration Strategy

### How Better-Auth Will Work

**New System:** Better-auth manages Google SSO + sessions

1. **Better-Auth Handles:**
   - Google OAuth flow (`/api/auth/sign-in/google`, `/api/auth/callback/google`)
   - Session management (stores sessions in `better_auth_session` table)
   - User authentication (stores users in `better_auth_user` table)

2. **Our System Handles:**
   - Tenant isolation (via `tenantId` in better-auth user)
   - User business data (in `users` table)
   - RequestHeader middleware (reads from better-auth session)

### Integration Approach

**Phase 1: Coexistence (Recommended)**
- Better-auth handles Google SSO
- Current session system remains for dev/testing
- Both systems work side-by-side
- Gradual migration

**Phase 2: Full Migration**
- Remove custom session code
- Use better-auth exclusively
- Keep dev routes for testing

### How They Tie Together

```
┌─────────────────────────────────────────────────────────┐
│                    User Authentication                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Google SSO → Better-Auth → Session → Middleware        │
│     ↓            ↓           ↓         ↓                │
│  OAuth      better_auth_  Cookie   RequestHeader        │
│  Flow       user table    Set      Set                   │
│                                                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Application Logic (Unchanged)              │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  RequestHeader → Services → Repositories → Database     │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

**Key Integration Points:**

1. **Middleware Integration:**
   - Current: Reads custom HMAC token → extracts userId/tenantId
   - New: Reads better-auth session → gets userId from `users` table → sets RequestHeader
   - **Same output:** `RequestHeader` with `userId` and `tenantId`

2. **Session Storage:**
   - Current: Stateless HMAC tokens (no DB)
   - New: Database-backed sessions (`better_auth_session` table)
   - **Benefit:** Can revoke sessions, better security

3. **User Linking:**
   - Better-auth user → Linked to `users` table via email
   - `tenantId` stored in better-auth user for fast lookup
   - **Same data:** User in `users` table (unchanged)

### Comparison: Current vs Better-Auth

| Feature | Current System | Better-Auth System |
|---------|---------------|-------------------|
| **Session Storage** | Stateless HMAC tokens (no DB) | Database-backed (`better_auth_session` table) |
| **Session Revocation** | Cannot revoke (stateless) | Can revoke sessions (delete from DB) |
| **Google SSO** | Not supported | ✅ Supported via OAuth |
| **User Provisioning** | Manual creation required | ✅ Automatic on first SSO |
| **Audit Logging** | No record of auth events | ✅ Log sign-in, sign-out, failed attempts |
| **Session Expiration** | 30 minutes (sliding window) | 30 minutes (sliding window) - matches current |
| **Dev/Testing** | Custom routes (`/api/auth/login`, `/api/auth/test-token`) | Can coexist with current system |
| **Middleware Performance** | Fast (token validation) | Fast (session lookup + user query) |
| **Tenant Isolation** | Via token payload | Via `tenantId` in better-auth user |

---

## Security Considerations

### High Severity Risks

| Risk                               | Description                              | Mitigation                                          |
|------------------------------------|------------------------------------------|-----------------------------------------------------|
| **No CSRF protection**             | Better-auth callback could be exploited  | Verify state parameter, use SameSite=Strict cookies |
| **Session fixation**               | Session token predictability             | Better-auth handles this, but verify token entropy  |
| **No rate limiting on auth endpoints** | Brute force attacks                      | Add rate limiting middleware to `/api/auth/*`       |
| **Tenant enumeration**            | Error messages reveal if tenant exists   | Use generic "Authentication failed" messages        |
| **Token in URL**                   | OAuth callback has token in URL (logged) | Ensure server logs don't capture query params       |

### Medium Severity Risks

| Risk                         | Description                              | Mitigation                                |
|------------------------------|------------------------------------------|-------------------------------------------|
| **No IP binding**            | Session valid from any IP                | Optional: bind session to IP range        |
| **Long session lifetime**    | 30 min may be too long for sensitive ops | Add step-up auth for sensitive operations |
| **No MFA**                   | Single factor (Google) only              | Plan for TOTP/WebAuthn in future          |
| **Secrets in env vars**      | BETTER_AUTH_SECRET exposure              | Use secret manager (GCP Secret Manager)   |
| **No session activity tracking** | Can't detect dormant sessions            | Track `last_active_at` in session table   |

### Code-Level Security Issues

#### Issue 1: Catch-All Error Handling

**Problem:** Current error handling hides different failure types:

```typescript
// ❌ BAD: Hides important security information
} catch (error: any) {
  logger.debug({ error: error.message }, 'Better-auth session validation failed');
}
```

**Fix:** Differentiate between error types:

```typescript
// ✅ GOOD: Differentiate error types
try {
  session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
} catch (error: any) {
  // Differentiate between "no session" vs "invalid session" vs "expired"
  if (error.message?.includes('expired')) {
    logger.debug({ error: error.message }, 'Session expired');
  } else if (error.message?.includes('invalid')) {
    logger.warn({ error: error.message, ip: c.req.header('x-forwarded-for') }, 'Invalid session token');
  } else {
    logger.debug({ error: error.message }, 'No session found');
  }
}
```

#### Issue 2: Dev Auth Fallback in Production

**Problem:** `ALLOW_DEV_AUTH` could accidentally be set in production:

```typescript
// ❌ BAD: Could allow dev auth in production
if (process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_AUTH === 'true') {
  // ...
}
```

**Fix:** Explicit production check:

```typescript
// ✅ GOOD: Explicit production check
const isDevelopment = process.env.NODE_ENV === 'development';
const allowDevAuth = process.env.ALLOW_DEV_AUTH === 'true';

if (isDevelopment && allowDevAuth) {
  // Only allow in development AND when explicitly enabled
  const requestHeader: RequestHeader = {
    tenantId: DEV_TENANT_ID,
    userId: DEV_USER_ID,
  };
  c.set('requestHeader', requestHeader);
  await next();
  return;
}

// Production: Never allow dev auth
if (!isDevelopment) {
  throw new UnauthorizedError('Authentication required');
}
```

#### Issue 3: No Validation on DEFAULT_TENANT_ID

**Problem:** Could allow access to wrong tenant if misconfigured:

```typescript
// ❌ BAD: No validation, could use wrong tenant
tenantId = domainResult[0]?.tenantId || process.env.DEFAULT_TENANT_ID || DEV_TENANT_ID;
```

**Fix:** Validate tenantId (already addressed in design decision #2 - no fallback):

```typescript
// ✅ GOOD: No fallback - throw error if tenantId missing
if (!domainResult[0]) {
  throw new Error(`No company domain found for ${domain}`);
}
const tenantId = domainResult[0].tenantId;
```

### Security Recommendations

1. **Add Rate Limiting:**
   ```typescript
   // Add to better-auth routes
   import { rateLimiter } from '../middleware/rateLimiter';
   betterAuthRoutes.use('*', rateLimiter({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 5, // 5 requests per window
   }));
   ```

2. **Use Generic Error Messages:**
   ```typescript
   // ❌ BAD: Reveals tenant existence
   throw new UnauthorizedError('User tenant not configured. Please contact support to map your email domain to a company.');
   
   // ✅ GOOD: Generic message
   throw new UnauthorizedError('Authentication failed. Please contact support.');
   ```

3. **Secure Cookie Settings:**
   ```typescript
   // Ensure better-auth uses secure cookies
   export const auth = betterAuth({
     // ... config ...
     session: {
       cookieOptions: {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'strict', // CSRF protection
       },
     },
   });
   ```

4. **Log Security Events:**
   ```typescript
   // Log failed authentication attempts
   logger.warn({
     email: session?.user?.email,
     ip: c.req.header('x-forwarded-for'),
     userAgent: c.req.header('user-agent'),
   }, 'Failed authentication attempt');
   ```

5. **Use Secret Manager:**
   ```typescript
   // Use GCP Secret Manager instead of env vars
   import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
   const secretClient = new SecretManagerServiceClient();
   const [version] = await secretClient.accessSecretVersion({
     name: 'projects/PROJECT_ID/secrets/BETTER_AUTH_SECRET/versions/latest',
   });
   const secret = version.payload?.data?.toString();
   ```

---

## Architectural Concerns & Solutions

### Issue 1: Two User Tables Complexity

**Clarification:**
- ✅ `employees` table was merged into `users` table (see `docs/USER_EMPLOYEE_MERGE_COMPLETE.md`)
- ✅ We have **2 tables** (not 3): `better_auth_user` and `users`
- ⚠️ Still need to keep them in sync

**Current Approach (Two Tables):**
- `better_auth_user` - Authentication data (managed by better-auth)
- `users` - Business logic data (firstName, lastName, rowStatus, tenantId, etc.)
- Link via email (unique per tenant)
- Store `tenantId` in better-auth user for fast lookup
- Create user in `users` table on first SSO

**Alternative Approach: Single Table with Custom Fields**

Use better-auth's user table as source of truth, add custom fields:

```typescript
// Option: Extend better-auth user table with custom fields
export const betterAuthUser = pgTable(
  'better_auth_user',
  {
    // Better-auth required fields
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    image: text('image'),
    
    // Custom fields (business logic)
    tenantId: uuid('tenant_id').references(() => tenants.id),
    firstName: varchar('first_name', { length: 60 }),
    lastName: varchar('last_name', { length: 60 }),
    rowStatus: smallint('row_status').notNull().default(0),
    
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }
);
```

**Challenges with Custom Fields Approach:**

1. **Schema Coupling:**
   - ❌ Business logic fields mixed with auth fields
   - ❌ Harder to separate concerns
   - ❌ Changes to business logic affect auth schema

2. **Better-Auth Updates:**
   - ⚠️ Better-auth may add/modify fields in future versions
   - ⚠️ Custom fields might conflict with better-auth updates
   - ⚠️ Need to test compatibility on every better-auth upgrade

3. **Migration Risk:**
   - ❌ If switching auth providers, need to migrate all fields
   - ❌ Business logic tied to auth provider
   - ❌ Harder to test auth independently

4. **Type Safety:**
   - ⚠️ Need to extend better-auth types with custom fields
   - ⚠️ Type definitions might get out of sync
   - ⚠️ Custom fields not validated by better-auth

5. **Query Complexity:**
   - ⚠️ All queries need to include auth fields
   - ⚠️ Can't query business logic without auth context
   - ⚠️ Harder to optimize queries

6. **Access Control:**
   - ⚠️ Better-auth manages user table directly
   - ⚠️ Need to ensure custom fields aren't overwritten
   - ⚠️ Business logic updates need to go through better-auth

**Comparison:**

| Aspect | Two Tables (Current) | Single Table (Custom Fields) |
|--------|---------------------|------------------------------|
| **Separation of Concerns** | ✅ Clear separation | ❌ Mixed concerns |
| **Sync Issues** | ⚠️ Need to keep in sync | ✅ Single source of truth |
| **Better-Auth Updates** | ✅ No impact | ⚠️ May conflict |
| **Migration Risk** | ✅ Low (only auth table) | ❌ High (all fields) |
| **Type Safety** | ✅ Clear types | ⚠️ Need custom types |
| **Query Complexity** | ✅ Simple queries | ⚠️ More complex |
| **Transaction Safety** | ⚠️ Need transactions | ✅ Single table |
| **Testing** | ✅ Test independently | ⚠️ Coupled testing |

**Hybrid Approach (Best of Both Worlds):**

Keep two tables but minimize sync issues:

```typescript
// 1. better_auth_user - Auth only (managed by better-auth)
// 2. users - Business logic only

// Link via email (unique per tenant)
// Store tenantId in better-auth user (for fast lookup)
// Use transactions to ensure atomicity
// Cache tenant resolution to reduce queries
```

**Recommendation:** 

**Keep two tables approach** because:
1. ✅ Clear separation of concerns (auth vs business logic)
2. ✅ Better-auth can update without affecting business logic
3. ✅ Easier to migrate auth providers if needed
4. ✅ Business logic queries don't need auth context
5. ✅ Transaction handling solves sync issues
6. ✅ Caching reduces performance impact

**Mitigation for Sync Issues:**
- ✅ Use transactions (Issue #3 - already addressed)
- ✅ Cache tenant resolution (Issue #2 - already addressed)
- ✅ Middleware chain for clear separation (Issue #4 - already addressed)
- ✅ Proper error handling and logging

**Note:** If sync issues become problematic, consider:
- Adding database triggers to keep tables in sync
- Using database views to join tables
- Implementing eventual consistency with background jobs

---

### Issue 2: Tenant Resolution Happens Twice

**Problem:**
- Once in hooks (user creation) - queries `customer_domains`
- Once in middleware (every request) - but we already store `tenantId` in better-auth user

**Current Solution:**
- ✅ We already store `tenantId` in `better_auth_user.tenant_id`
- ✅ Middleware reads directly from session (no query needed)
- ⚠️ But tenant resolution still happens in hooks during user creation

**Optimization:**
Cache tenantId lookup during user creation:

```typescript
// Cache email domain → tenantId mapping
const tenantCache = new Map<string, string>();

async linkBetterAuthUser(...) {
  const domain = email.split('@')[1];
  
  // Check cache first
  let tenantId = tenantCache.get(domain);
  
  if (!tenantId) {
    // Query database
    const domainResult = await this.db
      .select({ tenantId: customerDomains.tenantId })
      .from(customerDomains)
      .where(ilike(customerDomains.domain, domain.toLowerCase()))
      .limit(1);
    
    if (!domainResult[0]) {
      throw new Error(`No company domain found for ${domain}`);
    }
    
    tenantId = domainResult[0].tenantId;
    tenantCache.set(domain, tenantId); // Cache for future lookups
  }
  
  // Store in better-auth user (for middleware fast lookup)
  await this.db.update(betterAuthUser).set({ tenantId })...
}
```

**Recommendation:** Add caching for tenant resolution in hooks. Middleware is already optimized (reads from session).

---

### Issue 3: No Transaction Safety

**Problem:**
- User creation in `better_auth_user` and `users` not atomic
- Could have orphaned records on failure

**Current Approach:**
```typescript
// ❌ BAD: Not atomic
await db.update(betterAuthUser).set({ tenantId }); // Step 1
const user = await userRepository.create({ ... }); // Step 2 - could fail
```

**Fix: Use Database Transaction:**

```typescript
// ✅ GOOD: Atomic transaction
async linkBetterAuthUser(...) {
  return await this.db.transaction(async (tx) => {
    // 1. Update better-auth user with tenantId
    await tx
      .update(betterAuthUser)
      .set({ tenantId })
      .where(eq(betterAuthUser.id, betterAuthUserId));
    
    // 2. Check if user exists
    let user = await tx
      .select()
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        eq(users.email, email)
      ))
      .limit(1);
    
    if (!user[0]) {
      // 3. Create user in same transaction
      const [newUser] = await tx
        .insert(users)
        .values({
          tenantId,
          email,
          firstName,
          lastName,
          rowStatus: 0,
        })
        .returning();
      
      return { userId: newUser.id, tenantId: newUser.tenantId };
    }
    
    return { userId: user[0].id, tenantId: user[0].tenantId };
  });
}
```

**Recommendation:** Wrap user linking in a database transaction to ensure atomicity.

---

### Issue 4: Middleware Does Too Much

**Problem:**
- Auth validation + tenant resolution + user lookup all in one middleware
- Hard to test, hard to maintain

**Current Approach:**
```typescript
// ❌ BAD: Monolithic middleware
export async function requestHeaderMiddleware(c: Context, next: Next) {
  // 1. Validate session
  // 2. Get tenantId
  // 3. Get user
  // 4. Set RequestHeader
}
```

**Suggested Refactor: Middleware Chain**

```typescript
// ✅ GOOD: Separated concerns

// Step 1: Validate better-auth session
export async function betterAuthSessionMiddleware(c: Context, next: Next) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    
    if (session) {
      c.set('betterAuthSession', session);
    }
  } catch (error: any) {
    // Log but don't throw - let next middleware handle
    logger.debug({ error: error.message }, 'Better-auth session validation failed');
  }
  
  await next();
}

// Step 2: Resolve tenant from session
export async function tenantResolutionMiddleware(c: Context, next: Next) {
  const session = c.get('betterAuthSession');
  
  if (!session) {
    // Fallback to dev auth or throw
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true') {
      c.set('tenantId', DEV_TENANT_ID);
      c.set('userId', DEV_USER_ID);
      await next();
      return;
    }
    throw new UnauthorizedError('Authentication required');
  }
  
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) {
    throw new UnauthorizedError('Authentication failed. Please contact support.');
  }
  
  c.set('tenantId', tenantId);
  c.set('email', session.user.email);
  await next();
}

// Step 3: Load user and set RequestHeader
export async function userContextMiddleware(c: Context, next: Next) {
  const tenantId = c.get('tenantId');
  const email = c.get('email');
  
  if (!tenantId || !email) {
    throw new UnauthorizedError('Authentication required');
  }
  
  const userRepository = container.resolve(UserRepository);
  const user = await userRepository.findByEmail(tenantId, email);
  
  if (!user) {
    throw new UnauthorizedError('User not found. Please contact support.');
  }
  
  const requestHeader: RequestHeader = {
    tenantId: user.tenantId,
    userId: user.id,
  };
  
  c.set('requestHeader', requestHeader);
  await next();
}

// Usage: Chain middleware
app.use('*', betterAuthSessionMiddleware);
app.use('*', tenantResolutionMiddleware);
app.use('*', userContextMiddleware);
```

**Benefits:**
- ✅ Each middleware has single responsibility
- ✅ Easier to test individually
- ✅ Can reuse middleware in different contexts
- ✅ Clear separation of concerns

**Recommendation:** Refactor to middleware chain for better maintainability.

---

## Design Decisions

### 1. Store `tenantId` in Better-Auth User Table ✅

**Decision:** Add `tenant_id UUID` column to `better_auth_user` table.

**Rationale:**
- Fast lookup in middleware (no query to `customer_domains` on every request)
- ~50% faster middleware execution
- tenantId available directly in session object

**Implementation:**
- Add `tenantId: uuid('tenant_id')` to `betterAuthUser` schema
- Store during user creation/linking (one-time lookup)
- Read directly from `session.user.tenantId` in middleware

---

### 2. No Fallback for Missing `tenantId` ✅

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

### 3. No Auto-Update of `tenantId` ✅

**Decision:** If user's email domain changes → don't automatically update `tenantId`.

**Rationale:**
- Prevents accidental tenant switching
- Requires explicit admin action to change tenant
- Maintains data integrity

**Implementation:**
- Don't update `better_auth_user.tenant_id` if email domain changes
- Admin must manually update tenant mapping if needed

---

### 4. Automatic User Provisioning ✅

**Decision:** On first Google SSO → automatically create user in `users` table.

**Rationale:**
- Seamless onboarding experience
- No manual user creation required
- User is immediately available after first SSO

**Implementation:**
- Hook `after.signIn` or `after.user.created` triggers
- Extract `firstName`/`lastName` from Google `name` field
- Create user with `tenantId`, `email`, `firstName`, `lastName`, `rowStatus = 0`
- Link via email (unique per tenant)

---

## Backend Implementation

### Phase 1: Database Setup

#### Step 1.1: Create Better-Auth Tables

**File:** `sql/better_auth_tables.sql`

```sql
-- Better-Auth User Table
CREATE TABLE IF NOT EXISTS better_auth_user (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    name TEXT,
    image TEXT,
    tenant_id UUID REFERENCES tenants(id), -- Custom field: Store tenantId for fast lookup
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_better_auth_user_email ON better_auth_user(email);
CREATE INDEX IF NOT EXISTS idx_better_auth_user_tenant_id ON better_auth_user(tenant_id);

-- Better-Auth Session Table
CREATE TABLE IF NOT EXISTS better_auth_session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES better_auth_user(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    token TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_better_auth_session_user_id ON better_auth_session(user_id);
CREATE INDEX IF NOT EXISTS idx_better_auth_session_token ON better_auth_session(token);
CREATE INDEX IF NOT EXISTS idx_better_auth_session_expires_at ON better_auth_session(expires_at);

-- Better-Auth Account Table (Google OAuth)
CREATE TABLE IF NOT EXISTS better_auth_account (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES better_auth_user(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL DEFAULT 'google',
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    scope TEXT,
    id_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_better_auth_account_user_id ON better_auth_account(user_id);

-- Better-Auth Verification Table
CREATE TABLE IF NOT EXISTS better_auth_verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(identifier, value)
);

CREATE INDEX IF NOT EXISTS idx_better_auth_verification_expires_at ON better_auth_verification(expires_at);

-- Optional: Link users table to better-auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS better_auth_user_id TEXT REFERENCES better_auth_user(id);
CREATE INDEX IF NOT EXISTS idx_users_better_auth_user_id ON users(better_auth_user_id);
```

**Run:**
```bash
psql $DATABASE_URL -f sql/better_auth_tables.sql
```

---

### Phase 2: Install & Configure

#### Step 2.1: Install Package

```bash
cd apps/api
pnpm add better-auth
```

#### Step 2.2: Create Better-Auth Schema

**File:** `apps/api/src/auth/better-auth-schema.ts`

```typescript
import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenants/schema';

export const betterAuthUser = pgTable(
  'better_auth_user',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    image: text('image'),
    tenantId: uuid('tenant_id').references(() => tenants.id), // Custom field
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('idx_better_auth_user_email').on(table.email),
    tenantIdIdx: index('idx_better_auth_user_tenant_id').on(table.tenantId),
  })
);

export const betterAuthSession = pgTable(
  'better_auth_session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => betterAuthUser.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_better_auth_session_user_id').on(table.userId),
    tokenIdx: uniqueIndex('idx_better_auth_session_token').on(table.token),
    expiresAtIdx: index('idx_better_auth_session_expires_at').on(table.expiresAt),
  })
);

export const betterAuthAccount = pgTable(
  'better_auth_account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => betterAuthUser.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull().default('google'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    scope: text('scope'),
    idToken: text('id_token'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_better_auth_account_user_id').on(table.userId),
    providerAccountIdx: uniqueIndex('idx_better_auth_account_provider').on(
      table.providerId,
      table.accountId
    ),
  })
);

export const betterAuthVerification = pgTable(
  'better_auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    identifierValueIdx: uniqueIndex('idx_better_auth_verification_identifier_value').on(
      table.identifier,
      table.value
    ),
    expiresAtIdx: index('idx_better_auth_verification_expires_at').on(table.expiresAt),
  })
);
```

#### Step 2.3: Create Better-Auth Configuration

**File:** `apps/api/src/auth/better-auth.ts`

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDatabase } from '@crm/database';
import {
  betterAuthUser,
  betterAuthSession,
  betterAuthAccount,
  betterAuthVerification,
} from './better-auth-schema';

const db = getDatabase();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'drizzle',
    schema: {
      user: betterAuthUser,
      session: betterAuthSession,
      account: betterAuthAccount,
      verification: betterAuthVerification,
    },
  }),
  emailAndPassword: {
    enabled: false, // Google SSO only
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scope: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    },
  },
  session: {
    expiresIn: 30 * 60, // 30 minutes (matches current system)
    updateAge: 5 * 60,  // Update every 5 minutes (sliding window, matches current)
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', // CSRF protection
    },
  },
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:4001', // API runs on 4001
  basePath: '/api/auth',
  trustedOrigins: [
    process.env.WEB_URL || 'http://localhost:4000', // Web app runs on 4000
    process.env.SERVICE_API_URL || 'http://localhost:4001', // API runs on 4001
  ].filter(Boolean),
  secret: process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET!,
});
```

---

### Phase 3: User Linking Service

#### Step 3.1: Create User Linking Service

**File:** `apps/api/src/auth/better-auth-user-service.ts`

```typescript
import { injectable, inject } from 'tsyringe';
import { eq, ilike, and } from 'drizzle-orm';
import type { Database } from '@crm/database';
import { UserRepository } from '../users/repository';
import { TenantRepository } from '../tenants/repository';
import { customerDomains } from '../customers/schema';
import { users } from '../users/schema';
import { betterAuthUser } from './better-auth-schema';
import { logger } from '../utils/logger';

@injectable()
export class BetterAuthUserService {
  constructor(
    @inject('Database') private db: Database,
    private userRepository: UserRepository,
    private tenantRepository: TenantRepository
  ) {}

  /**
   * Link better-auth user to your users table
   * Determines tenantId from email domain via customer_domains table
   * Stores tenantId in better-auth user for fast lookup
   */
  // Cache for tenant resolution (optimization - Issue #2)
  private tenantCache = new Map<string, string>();

  async linkBetterAuthUser(
    betterAuthUserId: string,
    email: string,
    name: string | null,
    googleAccountId: string
  ): Promise<{ userId: string; tenantId: string }> {
    // ⚠️ ARCHITECTURE: Use transaction for atomicity (Issue #3)
    return await this.db.transaction(async (tx) => {
      // 1. Extract domain from email
      const domain = email.split('@')[1];
      if (!domain) {
        throw new Error(`Invalid email format: ${email}`);
      }

      // 2. Find tenantId via customer_domains table (with caching)
      let tenantId = this.tenantCache.get(domain);
      
      if (!tenantId) {
        const domainResult = await tx
          .select({ tenantId: customerDomains.tenantId })
          .from(customerDomains)
          .where(ilike(customerDomains.domain, domain.toLowerCase()))
          .limit(1);

        // Throw error if domain not found (design decision #2 - no fallback)
        if (!domainResult[0]) {
          logger.error(
            { email, domain },
            'No company domain found for email - user must have domain mapped before SSO'
          );
          throw new Error(
            `No company domain found for email domain "${domain}". ` +
            `Please contact your administrator to add this domain to a company before signing in.`
          );
        }

        tenantId = domainResult[0].tenantId;
        this.tenantCache.set(domain, tenantId); // Cache for future lookups
        logger.info(
          { email, domain, tenantId },
          'Found tenant via company domain'
        );
      }

      // 3. Update better-auth user with tenantId (in transaction)
      await tx
        .update(betterAuthUser)
        .set({ tenantId })
        .where(eq(betterAuthUser.id, betterAuthUserId));

      // 4. Check if user exists in users table (in same transaction)
      const existingUser = await tx
        .select()
        .from(users)
        .where(and(
          eq(users.tenantId, tenantId),
          eq(users.email, email)
        ))
        .limit(1);

      if (existingUser[0]) {
        // Existing user - already linked
        logger.info(
          { userId: existingUser[0].id, betterAuthUserId, email, tenantId },
          'Linked existing user to better-auth user'
        );
        return { userId: existingUser[0].id, tenantId: existingUser[0].tenantId };
      }

      // 5. Automatically provision new user in users table (in same transaction)
      const [firstName, ...lastNameParts] = (name || 'User').split(' ');
      const lastName = lastNameParts.join(' ') || '';

      const [newUser] = await tx
        .insert(users)
        .values({
          tenantId,
          email,
          firstName: firstName || 'User',
          lastName: lastName || '',
          rowStatus: 0, // Active by default
        })
        .returning();

      logger.info(
        { userId: newUser.id, betterAuthUserId, email, tenantId },
        'Automatically provisioned new user from Google SSO'
      );

      return { userId: newUser.id, tenantId: newUser.tenantId };
    });
  }
}
```

#### Step 3.2: Create Better-Auth Hooks

**File:** `apps/api/src/auth/better-auth-hooks.ts`

```typescript
import { auth } from './better-auth';
import { container } from 'tsyringe';
import { BetterAuthUserService } from './better-auth-user-service';
import { logger } from '../utils/logger';

/**
 * Setup better-auth hooks to automatically link users
 * 
 * ⚠️ IMPORTANT: Verify better-auth hook API against latest documentation
 * The syntax below may need adjustment based on actual better-auth version
 * 
 * Check: https://better-auth.com/docs/hooks
 */
export function setupBetterAuthHooks() {
  // ⚠️ TODO: Verify this hook API matches better-auth documentation
  // Hook: After user signs in with Google
  auth.hooks.after.signIn = async ({ user, account }) => {
    if (account?.provider === 'google' && user.email) {
      try {
        const betterAuthUserService = container.resolve(BetterAuthUserService);
        
        await betterAuthUserService.linkBetterAuthUser(
          user.id,
          user.email,
          user.name,
          account.accountId
        );

        logger.info(
          { betterAuthUserId: user.id, email: user.email },
          'Linked better-auth user after Google SSO'
        );
      } catch (error: any) {
        logger.error(
          { error, betterAuthUserId: user.id, email: user.email },
          'Failed to link better-auth user - sign-in will still succeed'
        );
        // Don't throw - better-auth sign-in should succeed
      }
    }
  };

  // ⚠️ TODO: Verify this hook API matches better-auth documentation
  // Hook: After user is created (first time Google SSO)
  auth.hooks.after.user.created = async ({ user, account }) => {
    if (account?.provider === 'google' && user.email) {
      try {
        const betterAuthUserService = container.resolve(BetterAuthUserService);
        
        await betterAuthUserService.linkBetterAuthUser(
          user.id,
          user.email,
          user.name,
          account.accountId
        );

        logger.info(
          { betterAuthUserId: user.id, email: user.email },
          'Created and linked user after Google SSO'
        );
      } catch (error: any) {
        logger.error(
          { error, betterAuthUserId: user.id, email: user.email },
          'Failed to create/link user after Google SSO'
        );
      }
    }
  };
}

/**
 * Alternative: Use callbacks in betterAuth config (if hooks don't work)
 * 
 * export const auth = betterAuth({
 *   // ... config ...
 *   callbacks: {
 *     onUserCreated: async ({ user, account }) => {
 *       // Link user logic here
 *     },
 *   },
 * });
 */
```

---

### Phase 4: Create Routes

#### Step 4.1: Create Better-Auth Routes

**File:** `apps/api/src/auth/better-auth-routes.ts`

```typescript
import { Hono } from 'hono';
import { auth } from './better-auth';

export const betterAuthRoutes = new Hono();

/**
 * Mount better-auth API handler
 * 
 * Handles:
 * - GET /api/auth/sign-in/google - Initiate Google SSO
 * - GET /api/auth/callback/google - Google OAuth callback
 * - GET /api/auth/session - Get current session
 * - POST /api/auth/sign-out - Sign out
 */
// ⚠️ SECURITY: Add rate limiting to prevent brute force attacks
// import { rateLimiter } from '../middleware/rateLimiter';
// betterAuthRoutes.use('*', rateLimiter({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 5, // 5 requests per window
// }));

betterAuthRoutes.all('*', async (c) => {
  const response = await auth.handler(c.req.raw);
  return response;
});
```

#### Step 4.2: Register Routes (Fix Route Conflict)

**File:** `apps/api/src/index.ts`

**⚠️ Route Conflict Fix:**

Better-auth handles `/api/auth/*` paths. Custom auth routes need different paths.

**Option A: Use Different Paths (Recommended)**

```typescript
import { betterAuthRoutes } from './auth/better-auth-routes';
import { authRoutes } from './auth/routes';

// Better-auth handles: /api/auth/sign-in/google, /api/auth/callback/google, /api/auth/session, /api/auth/sign-out
app.route('/api/auth', betterAuthRoutes);

// Custom routes moved to different path (for dev/testing only)
app.route('/api/auth/legacy', authRoutes);
// Now accessible at: /api/auth/legacy/login, /api/auth/legacy/test-token, etc.
```

**Option B: Remove Custom Routes**

If custom `/api/auth/login` and `/api/auth/test-token` are only for dev/testing, consider removing them entirely and using better-auth's endpoints only.

**Recommendation:** Use Option A - move custom routes to `/api/auth/legacy` for dev/testing.

---

### Phase 5: Update Middleware

#### Step 5.1: Update RequestHeader Middleware

**⚠️ ARCHITECTURE: Refactored to Middleware Chain (Issue #4)**

Instead of monolithic middleware, use separated middleware chain for better maintainability:

**File:** `apps/api/src/middleware/better-auth-session.ts`

```typescript
import { Context, Next } from 'hono';
import { auth } from '../auth/better-auth';
import { logger } from '../utils/logger';

/**
 * Step 1: Validate better-auth session
 * Only validates session, doesn't resolve tenant or user
 */
export async function betterAuthSessionMiddleware(c: Context, next: Next) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    
    if (session) {
      c.set('betterAuthSession', session);
    }
  } catch (error: any) {
    // ⚠️ SECURITY: Differentiate between error types for better security logging
    if (error.message?.includes('expired')) {
      logger.debug({ error: error.message }, 'Session expired');
    } else if (error.message?.includes('invalid')) {
      logger.warn({ 
        error: error.message, 
        ip: c.req.header('x-forwarded-for'),
        userAgent: c.req.header('user-agent'),
      }, 'Invalid session token - potential security issue');
    } else {
      logger.debug({ error: error.message }, 'No session found');
    }
  }
  
  await next();
}
```

**File:** `apps/api/src/middleware/tenant-resolution.ts`

```typescript
import { Context, Next } from 'hono';
import { UnauthorizedError } from '@crm/shared';
import { logger } from '../utils/logger';

const DEV_TENANT_ID = process.env.DEV_TENANT_ID || '00000000-0000-0000-0000-000000000000';
const DEV_USER_ID = process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000000';

/**
 * Step 2: Resolve tenant from session
 * Extracts tenantId from better-auth session
 */
export async function tenantResolutionMiddleware(c: Context, next: Next) {
  const session = c.get('betterAuthSession');
  
  if (!session) {
    // ⚠️ SECURITY: Explicit production check to prevent accidental dev auth in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    const allowDevAuth = process.env.ALLOW_DEV_AUTH === 'true';
    
    // Only allow dev auth in development AND when explicitly enabled
    if (isDevelopment && allowDevAuth) {
      c.set('tenantId', DEV_TENANT_ID);
      c.set('userId', DEV_USER_ID);
      await next();
      return;
    }
    
    // Production: Never allow dev auth
    throw new UnauthorizedError('Authentication required');
  }

  const tenantId = (session.user as any).tenantId;
  const email = session.user.email;
  
  if (!email) {
    throw new UnauthorizedError('Session missing email');
  }

  // Require tenantId - no fallback (design decision #2)
  if (!tenantId) {
    logger.error(
      { betterAuthUserId: session.user.id, email },
      'Better-auth user missing tenantId - user must have company domain mapped'
    );
    // ⚠️ SECURITY: Use generic error message to prevent tenant enumeration
    throw new UnauthorizedError('Authentication failed. Please contact support.');
  }

  c.set('tenantId', tenantId);
  c.set('email', email);
  await next();
}
```

**File:** `apps/api/src/middleware/user-context.ts`

```typescript
import { Context, Next } from 'hono';
import { UnauthorizedError } from '@crm/shared';
import type { RequestHeader } from '@crm/shared';
import { container } from 'tsyringe';
import { UserRepository } from '../users/repository';
import { logger } from '../utils/logger';

/**
 * Step 3: Load user and set RequestHeader
 * Gets user from users table and sets RequestHeader
 */
export async function userContextMiddleware(c: Context, next: Next) {
  const tenantId = c.get('tenantId');
  const email = c.get('email');
  
  if (!tenantId || !email) {
    throw new UnauthorizedError('Authentication required');
  }

  // Get user from users table (using tenantId from better-auth user)
  // ✅ Only one query needed - tenantId already known from session
  const userRepository = container.resolve(UserRepository);
  const user = await userRepository.findByEmail(tenantId, email);

  if (!user) {
    logger.warn(
      { email, tenantId },
      'Better-auth user not found in users table - may need manual linking'
    );
    throw new UnauthorizedError('User not found. Please contact support.');
  }

  // Create RequestHeader (same format as current system)
  const requestHeader: RequestHeader = {
    tenantId: user.tenantId,
    userId: user.id,
  };

  c.set('requestHeader', requestHeader);
  await next();
}
```

**File:** `apps/api/src/middleware/requestHeader.ts` (Legacy - for backward compatibility)

```typescript
// Re-export middleware chain for backward compatibility
export { betterAuthSessionMiddleware, tenantResolutionMiddleware, userContextMiddleware } from './better-auth-session';
export { tenantResolutionMiddleware } from './tenant-resolution';
export { userContextMiddleware } from './user-context';

/**
 * Combined middleware for backward compatibility
 * ⚠️ Consider migrating to middleware chain for better maintainability
 */
export async function requestHeaderMiddleware(c: Context, next: Next) {
  await betterAuthSessionMiddleware(c, async () => {
    await tenantResolutionMiddleware(c, async () => {
      await userContextMiddleware(c, next);
    });
  });
}
```

**Usage: Chain middleware in app**

```typescript
// Option A: Use middleware chain (recommended)
app.use('*', betterAuthSessionMiddleware);
app.use('*', tenantResolutionMiddleware);
app.use('*', userContextMiddleware);

// Option B: Use combined middleware (backward compatible)
app.use('*', requestHeaderMiddleware);
```

**Benefits of Middleware Chain:**
- ✅ Each middleware has single responsibility
- ✅ Easier to test individually
- ✅ Can reuse middleware in different contexts
- ✅ Clear separation of concerns

---

### Phase 6: Update DI Container

#### Step 6.1: Register Services & Schemas

**File:** `apps/api/src/di/container.ts`

```typescript
import { BetterAuthUserService } from '../auth/better-auth-user-service';
import {
  betterAuthUser,
  betterAuthSession,
  betterAuthAccount,
  betterAuthVerification,
} from '../auth/better-auth-schema';

export function setupContainer() {
  // Add better-auth schemas to database
  const db = createDatabase({
    // ... existing schemas ...
    betterAuthUser,
    betterAuthSession,
    betterAuthAccount,
    betterAuthVerification,
  });

  // Register better-auth services
  container.register(BetterAuthUserService, { useClass: BetterAuthUserService });

  // Setup better-auth hooks (after container is ready)
  import('../auth/better-auth-hooks').then(({ setupBetterAuthHooks }) => {
    setupBetterAuthHooks();
  });
}
```

#### Step 6.2: Export Schemas

**File:** `apps/api/src/schemas.ts`

```typescript
export { betterAuthUser, betterAuthSession, betterAuthAccount, betterAuthVerification } from './auth/better-auth-schema';
```

---

### Phase 7: Environment Variables

**File:** `apps/api/.env` or `.env.local`

```bash
# Google OAuth (already have)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Better-Auth
BETTER_AUTH_SECRET=your-secret-key-min-32-characters-long
BETTER_AUTH_URL=http://localhost:4001  # API runs on 4001
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4000  # Web app URL

# Dev mode (for current auth system fallback)
ALLOW_DEV_AUTH=true  # Optional: Keep current dev auth working
DEV_TENANT_ID=00000000-0000-0000-0000-000000000000
DEV_USER_ID=00000000-0000-0000-0000-000000000000
```

---

## Frontend Implementation

### Phase 1: Install Better-Auth Client

```bash
cd apps/web
pnpm add better-auth
```

### Phase 2: Create Auth Service

**File:** `apps/web/src/lib/auth.ts`

```typescript
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001',
  basePath: '/api/auth',
});

// Export auth methods
export const {
  signIn,
  signOut,
  useSession,
  getSession,
} = authClient;
```

### Phase 3: Create Login Page

**File:** `apps/web/src/app/login/page.tsx` (or `apps/web/src/pages/login.tsx`)

```typescript
'use client';

import { signIn } from '@/lib/auth';
import { useState } from 'react';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await signIn.social({
        provider: 'google',
        callbackURL: '/dashboard',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
        <div>
          <h2 className="text-center text-3xl font-bold">Sign In</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in with your Google account
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full rounded-md bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {isLoading ? 'Signing in...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}
```

### Phase 4: Session Management

**File:** `apps/web/src/contexts/AuthContext.tsx`

```typescript
'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useSession } from '@/lib/auth';

interface AuthContextType {
  user: any | null;
  session: any | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        session: session || null,
        isLoading: isPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### Phase 5: Protected Routes

**File:** `apps/web/src/components/ProtectedRoute.tsx`

```typescript
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
```

---

## Google Cloud Console Setup

### Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**

### Step 2: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (for testing) or **Internal** (for Google Workspace)
3. Fill in app name, support email, developer email
4. Add scopes:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`

### Step 3: Create OAuth Client ID

1. **Application type**: Web application
2. **Name**: CRM API OAuth Client
3. **Authorized JavaScript origins**:
   ```
   http://localhost:4001          # Dev API
   https://your-api-domain.com     # Production API
   ```
4. **Authorized redirect URIs**:
   ```
   http://localhost:4001/api/auth/callback/google          # Dev
   https://your-api-domain.com/api/auth/callback/google    # Production
   ```
5. Copy **Client ID** and **Client Secret**

### Step 4: Set Environment Variables

```bash
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

---

## Migration Strategy

### Strategy: Link on First SSO (Recommended)

**Approach:** When user SSOs with Google for the first time, check if user exists in `users` table by email + tenantId. If exists, link to better-auth user.

**Flow:**
1. User SSOs with Google (first time)
2. Better-auth creates `better_auth_user` record
3. Hook triggers `linkBetterAuthUser()`
4. Service checks if user exists in `users` table
5. If exists → link (store tenantId in better-auth user)
6. If not exists → create new user
7. User is now linked and can use the app

**No manual migration needed** - users link themselves automatically on first SSO.

### Coexistence with Current System

**Phase 1: Coexistence**
- Better-auth handles Google SSO
- Current session system remains for dev/testing
- Both systems work side-by-side
- Middleware tries better-auth first, falls back to current system in dev mode

**Phase 2: Full Migration**
- Remove custom session code (`apps/api/src/auth/session.ts`)
- Remove custom auth routes (or keep at `/api/auth/legacy`)
- Use better-auth exclusively

---

## Testing Checklist

### Backend
- [ ] Run database migration
- [ ] Install better-auth package
- [ ] Create better-auth schemas
- [ ] Configure better-auth
- [ ] Test Google SSO flow (`GET /api/auth/sign-in/google`)
- [ ] Verify user created in `better_auth_user` table
- [ ] Verify user created/linked in `users` table
- [ ] Verify session created
- [ ] Test API request with session → Works
- [ ] Test tenant isolation
- [ ] Test error case (domain not mapped)

### Frontend
- [ ] Install better-auth client
- [ ] Create auth service
- [ ] Create login page
- [ ] Create auth context
- [ ] Create protected route component
- [ ] Test Google sign-in button
- [ ] Test redirect flow
- [ ] Test session persistence
- [ ] Test protected routes
- [ ] Test logout

### Integration
- [ ] Google OAuth configured
- [ ] Callback URL set correctly
- [ ] Environment variables set
- [ ] CORS configured
- [ ] Existing users can SSO and link automatically

---

## Summary

### How Current and Better-Auth Systems Tie Together

**Current System (HMAC Tokens):**
- Stateless sessions (no DB)
- Dev/testing routes (`/api/auth/login`, `/api/auth/test-token`)
- Middleware validates HMAC token → extracts userId/tenantId

**Better-Auth System:**
- Database-backed sessions (`better_auth_session` table)
- Google SSO (`/api/auth/sign-in/google`)
- Middleware validates better-auth session → gets userId from `users` table

**Integration:**
- Both systems output same `RequestHeader` format
- Middleware tries better-auth first, falls back to current in dev mode
- Same application logic (services, repositories) - no changes needed
- Gradual migration path (coexistence → full migration)

### Key Benefits

1. **Google SSO** - Users can sign in with Google
2. **Automatic Provisioning** - Users created automatically on first SSO
3. **Better Security** - Database-backed sessions (can revoke)
4. **Same Interface** - `RequestHeader` unchanged, no app logic changes
5. **Gradual Migration** - Both systems work side-by-side

### Estimated Time

- Backend: 1.5-2 hours
- Frontend: 2-3 hours
- Google Setup: 30 minutes
- Testing: 1-2 hours
- **Total: 5-7 hours**

---

## Next Steps

1. ✅ Review this guide
2. ⏳ Verify better-auth hooks API syntax (check latest docs)
3. ⏳ Set up Google Cloud Console
4. ⏳ Implement backend
5. ⏳ Implement frontend
6. ⏳ Test end-to-end
7. ⏳ Deploy
