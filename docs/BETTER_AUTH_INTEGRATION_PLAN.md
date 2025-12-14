# Better-Auth Google SSO Integration Plan

## Current State Analysis

### ✅ What You Have

1. **Session System** (`apps/api/src/auth/session.ts`)
   - Custom HMAC-signed session tokens
   - 30-minute expiration
   - Sliding window auto-refresh (< 5 minutes)
   - Works with cookies and Authorization headers

2. **User Schema** (`apps/api/src/users/schema.ts`)
   - `users` table with `tenantId`, `email`, `firstName`, `lastName`
   - No password fields (good - ready for OAuth-only)
   - Tenant isolation built-in

3. **Gmail OAuth** (`apps/api/src/oauth/routes.ts`)
   - Custom Google OAuth for Gmail integration
   - Separate from user authentication
   - Stores tokens in `integrations` table

### ❌ What's Missing for Better-Auth

1. **Better-Auth Package** - Not installed
2. **Better-Auth Configuration** - No config file
3. **Database Integration** - No better-auth tables or adapter
4. **User-Tenant Mapping** - Need to link Google account to tenant
5. **Session Integration** - Need to replace/adapt custom sessions

---

## Recommended Integration Strategy

### Strategy: Custom Adapter + Keep Existing Users Table

**Why:**
- ✅ Reuse existing `users` table (no migration)
- ✅ Keep tenant isolation
- ✅ Single source of truth
- ✅ Minimal changes to existing code

---

## Implementation Steps

### Step 1: Install Better-Auth

```bash
cd apps/api
pnpm add better-auth
```

### Step 2: Extend Users Table (Minimal Changes)

Add better-auth linking fields:

```sql
ALTER TABLE users ADD COLUMN better_auth_user_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN google_account_id TEXT;
CREATE INDEX idx_users_better_auth_user_id ON users(better_auth_user_id);
```

**OR** - Use existing `email` as the link (if emails match).

### Step 3: Create Custom Drizzle Adapter

```typescript
// apps/api/src/auth/better-auth-drizzle-adapter.ts
import { DrizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@crm/database';
import { users } from '../users/schema';

// Custom adapter that maps better-auth to your users table
export const customDrizzleAdapter = DrizzleAdapter(db, {
  provider: 'drizzle',
  schema: {
    user: users, // Map better-auth user to your users table
    // Add other mappings as needed
  },
});
```

**Challenge:** Better-auth expects specific table structure. May need to create adapter tables or use better-auth's default tables.

### Step 4: Configure Better-Auth

```typescript
// apps/api/src/auth/better-auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@crm/database';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'drizzle',
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
    expiresIn: 30 * 60, // 30 minutes (matches your current)
    updateAge: 5 * 60,  // Update every 5 minutes (sliding window)
  },
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:4000',
  basePath: '/api/auth',
  trustedOrigins: [
    process.env.WEB_URL || 'http://localhost:4000',
  ],
});
```

### Step 5: Create Better-Auth Routes

```typescript
// apps/api/src/auth/better-auth-routes.ts
import { Hono } from 'hono';
import { auth } from './better-auth';

export const betterAuthRoutes = new Hono();

// Mount better-auth handler
betterAuthRoutes.all('*', async (c) => {
  return auth.handler(c.req.raw);
});
```

### Step 6: Update RequestHeader Middleware

```typescript
// apps/api/src/middleware/requestHeader.ts
import { auth } from '../auth/better-auth';

export async function requestHeaderMiddleware(c: Context, next: Next) {
  // Get session from better-auth
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    // Dev mode bypass
    if (process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_AUTH === 'true') {
      const requestHeader: RequestHeader = {
        tenantId: DEV_TENANT_ID,
        userId: DEV_USER_ID,
      };
      c.set('requestHeader', requestHeader);
      await next();
      return;
    }
    throw new UnauthorizedError('Authentication required');
  }

  // Get user from your users table (linked by email or better_auth_user_id)
  const userRepository = container.resolve(UserRepository);
  const user = await userRepository.findByEmail(session.user.email);
  
  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const requestHeader: RequestHeader = {
    tenantId: user.tenantId,
    userId: user.id,
  };
  
  c.set('requestHeader', requestHeader);
  await next();
}
```

### Step 7: Handle User Creation on First Login

```typescript
// apps/api/src/auth/better-auth-callback.ts
import { auth } from './better-auth';
import { UserRepository } from '../users/repository';

// Hook into better-auth sign-in to create user in your table
auth.hooks.after.signIn = async ({ user, account }) => {
  if (account.provider === 'google') {
    // Check if user exists in your users table
    const userRepo = container.resolve(UserRepository);
    const existingUser = await userRepo.findByEmail(user.email);
    
    if (!existingUser) {
      // Create user - need to determine tenantId
      // Option 1: From email domain
      // Option 2: From query parameter
      // Option 3: Default tenant
      
      const domain = user.email.split('@')[1];
      // Get tenant by domain or use default
      const tenantId = await getTenantIdByDomain(domain) || DEFAULT_TENANT_ID;
      
      await userRepo.create({
        tenantId,
        email: user.email,
        firstName: user.name?.split(' ')[0] || '',
        lastName: user.name?.split(' ').slice(1).join(' ') || '',
        betterAuthUserId: user.id,
        googleAccountId: account.accountId,
      });
    } else {
      // Link better-auth user to existing user
      await userRepo.update(existingUser.id, {
        betterAuthUserId: user.id,
        googleAccountId: account.accountId,
      });
    }
  }
};
```

---

## Key Challenges & Solutions

### Challenge 1: Tenant Mapping

**Problem:** Better-auth users don't have `tenantId`. How to determine tenant on first login?

**Solutions:**

**A. Email Domain Mapping:**
```typescript
// Extract domain from email
const domain = email.split('@')[1];
const tenant = await getTenantByDomain(domain);
```

**B. Query Parameter:**
```typescript
// Pass tenantId in OAuth state
const state = encodeState({ tenantId, ... });
// Retrieve in callback
```

**C. Default Tenant:**
```typescript
// Use default tenant for new users
const tenantId = DEFAULT_TENANT_ID;
```

**Recommendation:** Use email domain mapping + fallback to default

### Challenge 2: Database Schema Mismatch

**Problem:** Better-auth expects specific table structure, but you have custom `users` table.

**Solutions:**

**A. Use Better-Auth Tables + Sync:**
- Better-auth manages its own user table
- Sync to `users` table on login
- More complex, but keeps better-auth isolated

**B. Custom Adapter:**
- Create adapter that maps better-auth calls to your `users` table
- More work, but cleaner integration

**C. Hybrid:**
- Use better-auth tables for auth
- Link to `users` table via `better_auth_user_id`
- Query joins when needed

**Recommendation:** Option C (Hybrid) - simplest migration path

### Challenge 3: Session Integration

**Problem:** You have custom sessions, better-auth has its own sessions.

**Solutions:**

**A. Replace Custom Sessions:**
- Use better-auth sessions exclusively
- Update middleware to use better-auth session validation
- Simpler, but requires removing custom session code

**B. Keep Both:**
- Better-auth for authentication
- Custom sessions for API (convert better-auth session to custom token)
- More complex, but preserves existing code

**Recommendation:** Option A - use better-auth sessions (simpler long-term)

---

## Database Schema Options

### Option A: Use Better-Auth Tables (Recommended for Start)

Better-auth creates its own tables. Link to your `users` table:

```sql
-- Better-auth tables (created by better-auth)
-- better_auth_user
-- better_auth_session
-- better_auth_account
-- better_auth_verification

-- Link table
ALTER TABLE users ADD COLUMN better_auth_user_id TEXT REFERENCES better_auth_user(id);
CREATE INDEX idx_users_better_auth_user_id ON users(better_auth_user_id);
```

### Option B: Custom Adapter (Advanced)

Map better-auth to your existing `users` table. Requires custom adapter implementation.

---

## Migration Path

### Phase 1: Add Better-Auth (Non-Breaking)

1. Install better-auth
2. Create better-auth config
3. Add better-auth routes (`/api/auth/*`)
4. Keep existing auth routes (`/api/auth/login`, etc.)
5. Test Google SSO alongside existing auth

### Phase 2: Link Users

1. Add `better_auth_user_id` to `users` table
2. Create user on first Google SSO login
3. Link existing users by email
4. Test user creation and linking

### Phase 3: Replace Sessions

1. Update middleware to use better-auth sessions
2. Keep custom sessions as fallback
3. Test both session types
4. Remove custom sessions once stable

### Phase 4: Cleanup

1. Remove custom login endpoint (or keep for dev)
2. Update documentation
3. Update frontend to use better-auth

---

## Required Changes Summary

### Files to Create

1. `apps/api/src/auth/better-auth.ts` - Better-auth configuration
2. `apps/api/src/auth/better-auth-routes.ts` - Better-auth API routes
3. `apps/api/src/auth/better-auth-callback.ts` - User creation/linking logic
4. `sql/better_auth_tables.sql` - Database schema (if using better-auth tables)

### Files to Modify

1. `apps/api/src/middleware/requestHeader.ts` - Use better-auth sessions
2. `apps/api/src/index.ts` - Add better-auth routes
3. `apps/api/src/users/schema.ts` - Add `better_auth_user_id` field (optional)
4. `apps/api/src/auth/routes.ts` - Update or remove custom login

### Environment Variables

```bash
# Already have
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Need to add
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:4000
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4000
```

---

## Testing Checklist

- [ ] Google SSO login works
- [ ] User created in better-auth tables
- [ ] User linked to `users` table
- [ ] Session created and validated
- [ ] RequestHeader middleware works with better-auth sessions
- [ ] Tenant isolation maintained
- [ ] Sliding window refresh works
- [ ] Logout works
- [ ] Multiple Google accounts work (different tenants)

---

## Next Steps

1. **Install better-auth** and review its Drizzle adapter requirements
2. **Decide on schema approach** (better-auth tables vs custom adapter)
3. **Create configuration** with Google provider
4. **Test Google SSO flow** end-to-end
5. **Integrate with existing middleware**
