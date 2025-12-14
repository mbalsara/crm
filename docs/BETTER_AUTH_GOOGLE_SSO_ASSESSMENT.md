# Better-Auth Google SSO Integration Assessment

## Current State

### What Exists

1. **Session-Based Authentication** (`apps/api/src/auth/`)
   - Custom session tokens (HMAC-SHA256 signed)
   - Sliding window auto-refresh
   - Cookie + Authorization header support
   - Login endpoint (development only)

2. **Gmail OAuth** (`apps/api/src/oauth/`)
   - Custom Google OAuth flow for Gmail integration
   - Uses `googleapis` library
   - Stores refresh tokens in database
   - Separate from user authentication

3. **User Schema** (`apps/api/src/users/schema.ts`)
   - No password fields
   - No OAuth provider fields
   - Basic user info: firstName, lastName, email, tenantId

### What's Missing

1. **Better-Auth Package** - Not installed
2. **Better-Auth Configuration** - No config files
3. **Database Schema** - No better-auth tables
4. **User OAuth Linking** - No way to link Google account to user
5. **Session Integration** - Need to integrate better-auth sessions with current session system

---

## Better-Auth Overview

**Better-Auth** is a full-featured authentication library that supports:
- Multiple providers (Google, GitHub, etc.)
- Email/password (optional)
- Session management
- Database adapters (Drizzle, Prisma, etc.)

### Key Features
- ✅ Google OAuth provider built-in
- ✅ Session management
- ✅ Database adapter for Drizzle
- ✅ TypeScript support
- ✅ Works with Hono

---

## Integration Plan

### Step 1: Install Better-Auth

```bash
cd apps/api
pnpm add better-auth
```

### Step 2: Database Schema Changes

Better-Auth requires these tables:

```sql
-- Better-Auth core tables
CREATE TABLE better_auth_user (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  name TEXT,
  image TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE better_auth_session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES better_auth_user(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE better_auth_account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES better_auth_user(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL, -- 'google'
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  scope TEXT,
  id_token TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id, account_id)
);

CREATE TABLE better_auth_verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(identifier, value)
);
```

**OR** - Better approach: Map better-auth users to your existing `users` table.

### Step 3: Map Better-Auth to Existing Users Table

**Option A: Use Better-Auth Tables + Sync to Users**
- Better-auth manages its own user table
- Sync to `users` table on login
- More complex, but keeps better-auth isolated

**Option B: Custom Adapter (Recommended)**
- Create custom Drizzle adapter
- Use existing `users` table
- Map better-auth fields to your schema
- More work, but cleaner integration

**Option C: Extend Users Table**
- Add better-auth fields to `users` table
- Use custom adapter
- Single source of truth

---

## Recommended Approach: Custom Adapter

### Why Custom Adapter?

1. **Reuse existing users table** - No duplicate user data
2. **Keep tenant isolation** - Your users already have `tenantId`
3. **Integrate with existing sessions** - Can use better-auth sessions or keep custom sessions
4. **Simpler migration** - No data migration needed

### Implementation Steps

#### 1. Install Better-Auth

```bash
cd apps/api
pnpm add better-auth
```

#### 2. Create Custom Drizzle Adapter

```typescript
// apps/api/src/auth/better-auth-adapter.ts
import { DrizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@crm/database';
import { users } from '../users/schema';

// Map better-auth user to your users table
export const customAdapter = DrizzleAdapter(db, {
  provider: 'custom',
  // Customize table mappings
});
```

#### 3. Configure Better-Auth

```typescript
// apps/api/src/auth/better-auth-config.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from './better-auth-adapter';

export const auth = betterAuth({
  database: drizzleAdapter,
  emailAndPassword: {
    enabled: false, // Disable email/password, only Google SSO
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 30 * 60, // 30 minutes
    updateAge: 5 * 60, // Update every 5 minutes (sliding window)
  },
});
```

#### 4. Create Better-Auth Routes

```typescript
// apps/api/src/auth/better-auth-routes.ts
import { Hono } from 'hono';
import { auth } from './better-auth-config';

export const betterAuthRoutes = new Hono();

// Mount better-auth API routes
betterAuthRoutes.all('*', async (c) => {
  return auth.handler(c.req.raw);
});
```

#### 5. Update Users Table (Optional)

If you want to link better-auth accounts:

```sql
ALTER TABLE users ADD COLUMN better_auth_user_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN google_account_id TEXT;
CREATE INDEX idx_users_better_auth_user_id ON users(better_auth_user_id);
```

---

## What Needs to Change

### 1. **Remove Custom Login Endpoint**

**Current:** `POST /api/auth/login` (development only)

**Change:** Remove or keep for development, but use better-auth for production

### 2. **Update Session Middleware**

**Current:** Custom session tokens

**Options:**
- **Option A:** Use better-auth sessions (recommended)
- **Option B:** Keep custom sessions, sync with better-auth

**Recommendation:** Use better-auth sessions for consistency

### 3. **Update RequestHeader Middleware**

**Current:** Validates custom session tokens

**Change:** Validate better-auth sessions instead

```typescript
// apps/api/src/middleware/requestHeader.ts
import { auth } from '../auth/better-auth-config';

export async function requestHeaderMiddleware(c: Context, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  
  if (!session) {
    // Dev mode bypass or throw error
  }
  
  const requestHeader: RequestHeader = {
    tenantId: session.user.tenantId, // Need to map this
    userId: session.user.id,
  };
  
  c.set('requestHeader', requestHeader);
  await next();
}
```

### 4. **Map Better-Auth User to Your Users Table**

**Challenge:** Better-auth users don't have `tenantId` by default

**Solutions:**

**A. Store tenantId in better-auth user metadata:**
```typescript
// On Google SSO callback
const user = await auth.api.signInSocial({
  provider: 'google',
  callbackURL: '/api/auth/callback/google',
});

// After sign-in, link to your users table
await linkBetterAuthUserToTenant(user.id, tenantId);
```

**B. Derive tenantId from email domain:**
```typescript
// Extract domain from email
const domain = email.split('@')[1];
const tenant = await getTenantByDomain(domain);
```

**C. Use better-auth user metadata:**
```typescript
// Store tenantId in better-auth user metadata
await auth.api.updateUser({
  userId: user.id,
  metadata: { tenantId },
});
```

### 5. **Update OAuth Routes**

**Current:** Custom Gmail OAuth (`/oauth/gmail/*`)

**Options:**
- **Keep separate** - Gmail OAuth for integrations, better-auth for user login
- **Consolidate** - Use better-auth for both (if possible)

**Recommendation:** Keep separate for now
- Gmail OAuth = Integration-specific (needs Gmail scopes)
- Better-Auth = User authentication (needs basic profile scopes)

---

## Missing Pieces

### 1. **Better-Auth Installation**
```bash
cd apps/api
pnpm add better-auth
```

### 2. **Database Schema**
- Better-auth tables OR custom adapter mapping
- Link better-auth users to your `users` table

### 3. **Configuration**
- Google OAuth credentials (already have `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- Session configuration
- Base URL for callbacks

### 4. **Custom Adapter**
- Map better-auth to your `users` table
- Handle `tenantId` mapping
- Sync user data

### 5. **Middleware Updates**
- Replace custom session validation with better-auth
- Map better-auth user to `RequestHeader`

### 6. **Frontend Integration**
- Update login flow to use better-auth
- Handle Google SSO redirect
- Store better-auth session

---

## Implementation Checklist

### Phase 1: Setup
- [ ] Install better-auth package
- [ ] Create better-auth configuration
- [ ] Set up Google OAuth provider
- [ ] Configure callback URLs

### Phase 2: Database
- [ ] Decide: Use better-auth tables OR custom adapter
- [ ] Create database schema (if using better-auth tables)
- [ ] OR create custom adapter (if using existing users table)
- [ ] Add migration scripts

### Phase 3: Integration
- [ ] Create better-auth routes
- [ ] Update requestHeader middleware
- [ ] Map better-auth user to tenantId
- [ ] Sync better-auth user to users table

### Phase 4: Testing
- [ ] Test Google SSO flow
- [ ] Verify session creation
- [ ] Test session validation
- [ ] Test tenant isolation

### Phase 5: Cleanup
- [ ] Remove/update custom login endpoint
- [ ] Update documentation
- [ ] Update frontend client

---

## Key Decisions Needed

### 1. **User Table Strategy**
- **Option A:** Use better-auth's user table + sync to `users`
- **Option B:** Custom adapter using existing `users` table
- **Option C:** Extend `users` table with better-auth fields

**Recommendation:** Option B (custom adapter) - cleaner, single source of truth

### 2. **Session Strategy**
- **Option A:** Use better-auth sessions (replace custom sessions)
- **Option B:** Keep custom sessions, sync with better-auth

**Recommendation:** Option A - simpler, better-auth handles sliding window

### 3. **Tenant Mapping**
- **Option A:** Store tenantId in better-auth user metadata
- **Option B:** Derive tenantId from email domain
- **Option C:** Separate mapping table

**Recommendation:** Option A - most flexible

### 4. **Gmail OAuth**
- **Option A:** Keep separate (current implementation)
- **Option B:** Consolidate with better-auth

**Recommendation:** Option A - different purposes (integration vs auth)

---

## Environment Variables Needed

```bash
# Google OAuth (already have these)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Better-Auth
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:4000  # Base URL for callbacks
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4000,https://yourdomain.com
```

---

## Next Steps

1. **Decide on approach** (custom adapter vs better-auth tables)
2. **Install better-auth**
3. **Create configuration**
4. **Set up database schema/adapter**
5. **Update middleware**
6. **Test Google SSO flow**

---

## References

- [Better-Auth Docs](https://www.better-auth.com/)
- [Better-Auth Google Provider](https://www.better-auth.com/docs/guides/social-auth/google)
- [Better-Auth Drizzle Adapter](https://www.better-auth.com/docs/guides/database/drizzle)
