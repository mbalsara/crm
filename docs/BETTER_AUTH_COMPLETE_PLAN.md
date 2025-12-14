# Better-Auth Integration - Complete Implementation Plan

## Current State

- **Users Table**: `users` (or `employees` in database - same entity)
- **Email Column**: `email` (unique per tenant)
- **Tenant Isolation**: `tenantId` column
- **No Password**: Table ready for OAuth-only auth
- **Custom Sessions**: HMAC-signed session tokens

## Goal

Enable Google SSO using better-auth, mapping to existing `users` table.

---

## Architecture Decision

### Strategy: Better-Auth Tables + Link to Users Table

**Why:**
- ✅ Better-auth manages its own auth tables (sessions, accounts)
- ✅ Link better-auth users to your `users` table via email
- ✅ Keep tenant isolation in your `users` table
- ✅ Minimal changes to existing code

---

## Step-by-Step Implementation Plan

### Phase 1: Install & Configure Better-Auth

#### 1.1 Install Package

```bash
cd apps/api
pnpm add better-auth
```

#### 1.2 Create Better-Auth Configuration

```typescript
// apps/api/src/auth/better-auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@crm/database';
import { betterAuthUser, betterAuthSession, betterAuthAccount, betterAuthVerification } from './better-auth-schema';

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
    expiresIn: 30 * 60, // 30 minutes (matches your current)
    updateAge: 5 * 60,  // Update every 5 minutes (sliding window)
  },
  baseURL: process.env.BETTER_AUTH_URL || process.env.SERVICE_API_URL || 'http://localhost:4000',
  basePath: '/api/auth',
  trustedOrigins: [
    process.env.WEB_URL || 'http://localhost:4000',
    process.env.SERVICE_API_URL || 'http://localhost:4000',
  ],
  secret: process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET!,
});
```

#### 1.3 Create Better-Auth Schema

```typescript
// apps/api/src/auth/better-auth-schema.ts
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Better-Auth User Table
 * Stores authentication user data
 * Linked to users table via email
 */
export const betterAuthUser = pgTable(
  'better_auth_user',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('idx_better_auth_user_email').on(table.email),
  })
);

/**
 * Better-Auth Session Table
 * Stores active sessions
 */
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

/**
 * Better-Auth Account Table
 * Stores OAuth provider accounts (Google)
 */
export const betterAuthAccount = pgTable(
  'better_auth_account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => betterAuthUser.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(), // Google user ID
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

/**
 * Better-Auth Verification Table
 * For email verification (if needed later)
 */
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

#### 1.4 Create SQL Migration

```sql
-- sql/better_auth_tables.sql

-- Better-Auth User Table
CREATE TABLE IF NOT EXISTS better_auth_user (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    name TEXT,
    image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_better_auth_user_email ON better_auth_user(email);

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

-- Better-Auth Account Table
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

-- Link users table to better-auth users
ALTER TABLE users ADD COLUMN IF NOT EXISTS better_auth_user_id TEXT REFERENCES better_auth_user(id);
CREATE INDEX IF NOT EXISTS idx_users_better_auth_user_id ON users(better_auth_user_id);
```

---

### Phase 2: Create Better-Auth Routes

#### 2.1 Create Better-Auth API Routes

```typescript
// apps/api/src/auth/better-auth-routes.ts
import { Hono } from 'hono';
import { auth } from './better-auth';

export const betterAuthRoutes = new Hono();

/**
 * Mount better-auth API handler
 * Handles all better-auth endpoints:
 * - GET /api/auth/sign-in/google - Initiate Google SSO
 * - GET /api/auth/callback/google - Google OAuth callback
 * - GET /api/auth/session - Get current session
 * - POST /api/auth/sign-out - Sign out
 */
betterAuthRoutes.all('*', async (c) => {
  const response = await auth.handler(c.req.raw);
  return response;
});
```

#### 2.2 Register Routes

```typescript
// apps/api/src/index.ts
import { betterAuthRoutes } from './auth/better-auth-routes';

// Add before other routes
app.route('/api/auth', betterAuthRoutes); // Better-auth handles /api/auth/*
app.route('/api/auth', authRoutes);      // Your custom auth routes (login, test-token, etc.)
```

---

### Phase 3: User Creation & Linking Logic

#### 3.1 Create User Linking Service

```typescript
// apps/api/src/auth/better-auth-user-service.ts
import { injectable, inject } from 'tsyringe';
import { container } from 'tsyringe';
import { UserRepository } from '../users/repository';
import { TenantRepository } from '../tenants/repository';
import { logger } from '../utils/logger';

@injectable()
export class BetterAuthUserService {
  constructor(
    @inject('Database') private db: any,
    private userRepository: UserRepository,
    private tenantRepository: TenantRepository
  ) {}

  /**
   * Link better-auth user to your users table
   * Called after Google SSO login
   */
  async linkBetterAuthUser(
    betterAuthUserId: string,
    email: string,
    name: string | null,
    googleAccountId: string
  ): Promise<{ userId: string; tenantId: string }> {
    // 1. Determine tenantId from email domain
    const domain = email.split('@')[1];
    let tenant = await this.getTenantByDomain(domain);
    
    // 2. If no tenant found, use default or create
    if (!tenant) {
      tenant = await this.getDefaultTenant();
      logger.warn(
        { email, domain },
        'No tenant found for domain, using default tenant'
      );
    }

    // 3. Check if user already exists in users table
    let user = await this.userRepository.findByEmail(tenant.id, email);

    if (user) {
      // Link existing user to better-auth user
      await this.userRepository.update(user.id, {
        // Add better_auth_user_id field if you add it to schema
        // betterAuthUserId: betterAuthUserId,
      });
      
      logger.info(
        { userId: user.id, betterAuthUserId, email },
        'Linked existing user to better-auth user'
      );
      
      return { userId: user.id, tenantId: tenant.id };
    }

    // 4. Create new user in users table
    const [firstName, ...lastNameParts] = (name || 'User').split(' ');
    const lastName = lastNameParts.join(' ') || '';

    user = await this.userRepository.create({
      tenantId: tenant.id,
      email,
      firstName: firstName || 'User',
      lastName: lastName || '',
      rowStatus: 0, // Active
    });

    logger.info(
      { userId: user.id, betterAuthUserId, email, tenantId: tenant.id },
      'Created new user from better-auth Google SSO'
    );

    return { userId: user.id, tenantId: tenant.id };
  }

  /**
   * Get tenant by email domain
   */
  private async getTenantByDomain(domain: string): Promise<any | null> {
    // Option 1: Query company_domains table
    const { CompanyRepository } = await import('../companies/repository');
    const companyRepo = container.resolve(CompanyRepository);
    const company = await companyRepo.findByDomain(domain);
    
    if (company) {
      const tenant = await this.tenantRepository.findById(company.tenantId);
      return tenant || null;
    }

    // Option 2: Query tenants table directly (if you store domains there)
    // const tenant = await this.tenantRepository.findByDomain(domain);
    // return tenant;

    return null;
  }

  /**
   * Get default tenant
   */
  private async getDefaultTenant(): Promise<any> {
    const defaultTenantId = process.env.DEFAULT_TENANT_ID;
    if (defaultTenantId) {
      const tenant = await this.tenantRepository.findById(defaultTenantId);
      if (tenant) return tenant;
    }

    // Get first tenant or create default
    const tenants = await this.tenantRepository.findAll();
    if (tenants.length > 0) {
      return tenants[0];
    }

    throw new Error('No tenant found and no default tenant configured');
  }
}
```

#### 3.2 Create Better-Auth Hooks

```typescript
// apps/api/src/auth/better-auth-hooks.ts
import { auth } from './better-auth';
import { container } from 'tsyringe';
import { BetterAuthUserService } from './better-auth-user-service';
import { logger } from '../utils/logger';

/**
 * Setup better-auth hooks to link users
 */
export function setupBetterAuthHooks() {
  // Hook: After user signs in with Google
  auth.hooks.after.signIn = async ({ user, account }) => {
    if (account.provider === 'google') {
      try {
        const betterAuthUserService = container.resolve(BetterAuthUserService);
        
        await betterAuthUserService.linkBetterAuthUser(
          user.id,
          user.email!,
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
          'Failed to link better-auth user'
        );
        // Don't throw - better-auth sign-in should still succeed
      }
    }
  };

  // Hook: After user is created (first time Google SSO)
  auth.hooks.after.user.created = async ({ user, account }) => {
    if (account?.provider === 'google') {
      try {
        const betterAuthUserService = container.resolve(BetterAuthUserService);
        
        await betterAuthUserService.linkBetterAuthUser(
          user.id,
          user.email!,
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
```

---

### Phase 4: Update Middleware

#### 4.1 Update RequestHeader Middleware

```typescript
// apps/api/src/middleware/requestHeader.ts
import { Context, Next } from 'hono';
import { UnauthorizedError } from '@crm/shared';
import type { RequestHeader } from '@crm/shared';
import { auth } from '../auth/better-auth';
import { container } from 'tsyringe';
import { UserRepository } from '../users/repository';

// Dev mode bypass
const DEV_TENANT_ID = process.env.DEV_TENANT_ID || '00000000-0000-0000-0000-000000000000';
const DEV_USER_ID = process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000000';

export async function requestHeaderMiddleware(c: Context, next: Next) {
  // 1. Try to get better-auth session
  let session;
  try {
    session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
  } catch (error) {
    // Session validation failed, continue to dev mode check
  }

  // 2. If no session, check dev mode
  if (!session) {
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

  // 3. Get user from your users table (linked by email)
  const userRepository = container.resolve(UserRepository);
  const user = await userRepository.findByEmail(session.user.email);

  if (!user) {
    // User exists in better-auth but not in users table
    // This shouldn't happen if hooks work correctly, but handle gracefully
    logger.warn(
      { betterAuthUserId: session.user.id, email: session.user.email },
      'Better-auth user not found in users table'
    );
    throw new UnauthorizedError('User not found');
  }

  // 4. Create RequestHeader from your user
  const requestHeader: RequestHeader = {
    tenantId: user.tenantId,
    userId: user.id,
  };

  c.set('requestHeader', requestHeader);
  c.set('betterAuthSession', session); // Optional: expose better-auth session

  await next();
}
```

---

### Phase 5: Update DI Container

#### 5.1 Register Better-Auth Services

```typescript
// apps/api/src/di/container.ts
import { BetterAuthUserService } from '../auth/better-auth-user-service';
import { betterAuthUser, betterAuthSession, betterAuthAccount, betterAuthVerification } from '../auth/better-auth-schema';

export function setupContainer() {
  // ... existing code ...

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

  // Setup better-auth hooks
  const { setupBetterAuthHooks } = await import('../auth/better-auth-hooks');
  setupBetterAuthHooks();
}
```

---

### Phase 6: Update Auth Routes

#### 6.1 Keep Custom Routes for Dev/Testing

```typescript
// apps/api/src/auth/routes.ts
// Keep existing routes for:
// - POST /api/auth/login (dev only)
// - POST /api/auth/test-token (dev only)
// - GET /api/auth/me (works with better-auth sessions)
// - POST /api/auth/logout (can use better-auth or custom)
```

#### 6.2 Update Logout to Use Better-Auth

```typescript
// Option: Use better-auth logout
authRoutes.post('/logout', async (c) => {
  await auth.api.signOut({
    headers: c.req.raw.headers,
  });
  
  return c.json({ success: true });
});
```

---

### Phase 7: Environment Variables

```bash
# Google OAuth (already have)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Better-Auth
BETTER_AUTH_SECRET=your-secret-key-min-32-chars
BETTER_AUTH_URL=http://localhost:4000  # Or SERVICE_API_URL
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4000

# Optional: Default tenant for new users
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000000
```

---

## Complete File Structure

```
apps/api/src/auth/
├── better-auth.ts                    # Better-auth configuration
├── better-auth-schema.ts            # Better-auth Drizzle schemas
├── better-auth-routes.ts            # Better-auth API routes
├── better-auth-hooks.ts             # User creation/linking hooks
├── better-auth-user-service.ts      # User linking service
├── session.ts                        # Keep for now (can remove later)
└── routes.ts                         # Keep custom routes (dev/testing)

apps/api/src/middleware/
└── requestHeader.ts                  # Updated to use better-auth sessions

apps/api/src/di/
└── container.ts                      # Register better-auth services

sql/
└── better_auth_tables.sql           # Database migration
```

---

## Implementation Order

### Step 1: Database Setup
1. Run `sql/better_auth_tables.sql` migration
2. Add `better_auth_user_id` column to `users` table (optional, for linking)

### Step 2: Install & Configure
1. Install better-auth: `pnpm add better-auth`
2. Create `better-auth-schema.ts`
3. Create `better-auth.ts` configuration
4. Set environment variables

### Step 3: Routes & Hooks
1. Create `better-auth-routes.ts`
2. Register routes in `index.ts`
3. Create `better-auth-user-service.ts`
4. Create `better-auth-hooks.ts`
5. Setup hooks in DI container

### Step 4: Middleware Integration
1. Update `requestHeaderMiddleware` to use better-auth sessions
2. Test session validation
3. Test tenant isolation

### Step 5: Testing
1. Test Google SSO flow
2. Verify user creation in `users` table
3. Verify session works
4. Verify tenant isolation

### Step 6: Cleanup (Optional)
1. Remove custom session code (or keep as fallback)
2. Update documentation
3. Update frontend

---

## Key Implementation Details

### User Linking Strategy

**On First Google SSO Login:**
1. Better-auth creates user in `better_auth_user` table
2. Hook triggers `better-auth-user-service.linkBetterAuthUser()`
3. Service determines `tenantId` from email domain
4. Service creates user in `users` table
5. Link via email (or `better_auth_user_id` if you add the column)

### Tenant Mapping

**How to determine tenantId:**

**Option A: Email Domain → Company Domain → Tenant**
```typescript
email: "user@acme.com"
  → Find company with domain "acme.com"
  → Get company.tenantId
  → Use that tenantId
```

**Option B: Email Domain → Tenant Domain Mapping**
```typescript
// If you have tenant_domains table
email: "user@acme.com"
  → Find tenant with domain "acme.com"
  → Use that tenantId
```

**Option C: Default Tenant**
```typescript
// If no mapping found
  → Use DEFAULT_TENANT_ID from env
  → Or first tenant in database
```

**Recommendation:** Option A (email → company domain → tenant)

### Session Flow

```
1. User clicks "Sign in with Google"
   ↓
2. Redirect to /api/auth/sign-in/google
   ↓
3. Better-auth redirects to Google
   ↓
4. User authorizes
   ↓
5. Google redirects to /api/auth/callback/google
   ↓
6. Better-auth creates session
   ↓
7. Hook creates/links user in users table
   ↓
8. Session cookie set
   ↓
9. Subsequent requests use better-auth session
   ↓
10. Middleware validates session → gets user from users table → sets RequestHeader
```

---

## Testing Plan

### 1. Google SSO Flow
- [ ] Click "Sign in with Google" → Redirects to Google
- [ ] Authorize → Redirects back → Session created
- [ ] User created in `better_auth_user` table
- [ ] User created/linked in `users` table
- [ ] Session cookie set

### 2. Session Validation
- [ ] Request with session cookie → Validated
- [ ] Request without session → 401 Unauthorized
- [ ] Request with expired session → 401 Unauthorized

### 3. Tenant Isolation
- [ ] User from tenant A → Can only access tenant A data
- [ ] User from tenant B → Can only access tenant B data

### 4. User Linking
- [ ] First login → User created in `users` table
- [ ] Second login → Existing user linked (no duplicate)
- [ ] Email domain → Correct tenant assigned

---

## Migration Checklist

- [ ] Install better-auth package
- [ ] Create better-auth schemas
- [ ] Run database migration
- [ ] Create better-auth configuration
- [ ] Create better-auth routes
- [ ] Create user linking service
- [ ] Setup better-auth hooks
- [ ] Update requestHeader middleware
- [ ] Register services in DI container
- [ ] Set environment variables
- [ ] Test Google SSO flow
- [ ] Test session validation
- [ ] Test tenant isolation
- [ ] Update frontend (if needed)
- [ ] Update documentation

---

## Potential Issues & Solutions

### Issue 1: Email Domain → Tenant Mapping

**Problem:** How to determine tenantId from email?

**Solution:** Query `company_domains` table:
```typescript
const domain = email.split('@')[1];
const company = await companyRepo.findByDomain(domain);
const tenantId = company?.tenantId || DEFAULT_TENANT_ID;
```

### Issue 2: Better-Auth User ID Type

**Problem:** Better-auth uses `TEXT` for user IDs, your users use `UUID`.

**Solution:** Link via email (unique per tenant) or add `better_auth_user_id TEXT` column.

### Issue 3: Session Cookie vs Authorization Header

**Problem:** Better-auth uses cookies, your API might use Authorization headers.

**Solution:** Better-auth supports both. Configure to accept Authorization header:
```typescript
auth = betterAuth({
  // ... config ...
  session: {
    cookieCache: {
      enabled: true,
    },
  },
});
```

### Issue 4: Multiple Google Accounts Same Email

**Problem:** User has multiple Google accounts with same email.

**Solution:** Better-auth handles this - each account gets separate `better_auth_user` record, but can link to same `users` record via email.

---

## Summary

**Complete plan to enable better-auth Google SSO:**

1. ✅ Install better-auth
2. ✅ Create better-auth tables (or use adapter)
3. ✅ Configure Google provider
4. ✅ Create user linking service (email → tenantId → users table)
5. ✅ Setup hooks to auto-create/link users
6. ✅ Update middleware to use better-auth sessions
7. ✅ Test end-to-end flow

**Key Points:**
- Better-auth manages auth tables
- Your `users` table stores business data
- Link via email (or better_auth_user_id)
- Determine tenantId from email domain
- Keep existing tenant isolation logic
