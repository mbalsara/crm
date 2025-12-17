# Better-Auth Google SSO - Complete Implementation Plan

## Current State

- **Users Table**: `users` (has `email` column, unique per tenant)
- **Tenant Isolation**: `users.tenantId` column
- **Email → Tenant Mapping**: Via `customer_domains` table (email domain → company → tenant)
- **No Password**: Ready for OAuth-only
- **Custom Sessions**: HMAC-signed tokens (will replace with better-auth sessions)

---

## Complete Implementation Plan

### Phase 1: Database Setup

#### Step 1.1: Create Better-Auth Tables

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

-- Better-Auth Verification Table (for email verification if needed)
CREATE TABLE IF NOT EXISTS better_auth_verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(identifier, value)
);

CREATE INDEX IF NOT EXISTS idx_better_auth_verification_expires_at ON better_auth_verification(expires_at);

-- Link users table to better-auth (optional, for direct linking)
ALTER TABLE users ADD COLUMN IF NOT EXISTS better_auth_user_id TEXT REFERENCES better_auth_user(id);
CREATE INDEX IF NOT EXISTS idx_users_better_auth_user_id ON users(better_auth_user_id);
```

**Run migration:**
```bash
psql $DATABASE_URL -f sql/better_auth_tables.sql
```

---

### Phase 2: Install & Configure Better-Auth

#### Step 2.1: Install Package

```bash
cd apps/api
pnpm add better-auth
```

#### Step 2.2: Create Better-Auth Schema (Drizzle)

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

/**
 * Better-Auth User Table
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
 * Better-Auth Account Table (Google OAuth)
 */
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

/**
 * Better-Auth Verification Table
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

export type BetterAuthUser = typeof betterAuthUser.$inferSelect;
export type BetterAuthSession = typeof betterAuthSession.$inferSelect;
export type BetterAuthAccount = typeof betterAuthAccount.$inferSelect;
```

#### Step 2.3: Create Better-Auth Configuration

```typescript
// apps/api/src/auth/better-auth.ts
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
    expiresIn: 30 * 60, // 30 minutes (matches your current)
    updateAge: 5 * 60,  // Update every 5 minutes (sliding window)
  },
  baseURL: process.env.BETTER_AUTH_URL || process.env.SERVICE_API_URL || 'http://localhost:4000',
  basePath: '/api/auth',
  trustedOrigins: [
    process.env.WEB_URL || 'http://localhost:4000',
    process.env.SERVICE_API_URL || 'http://localhost:4000',
  ].filter(Boolean),
  secret: process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET!,
});
```

---

### Phase 3: User Linking Service

#### Step 3.1: Create User Linking Service

```typescript
// apps/api/src/auth/better-auth-user-service.ts
import { injectable, inject } from 'tsyringe';
import { container } from 'tsyringe';
import type { Database } from '@crm/database';
import { UserRepository } from '../users/repository';
import { CompanyRepository } from '../customers/repository';
import { TenantRepository } from '../tenants/repository';
import { logger } from '../utils/logger';

@injectable()
export class BetterAuthUserService {
  constructor(
    @inject('Database') private db: Database,
    private userRepository: UserRepository,
    private companyRepository: CompanyRepository,
    private tenantRepository: TenantRepository
  ) {}

  /**
   * Link better-auth user to your users table
   * Called after Google SSO login
   * 
   * Flow:
   * 1. Extract email domain
   * 2. Find company by domain → get tenantId
   * 3. Check if user exists in users table (by email + tenantId)
   * 4. If exists → link (update better_auth_user_id if column exists)
   * 5. If not exists → create user in users table
   */
  async linkBetterAuthUser(
    betterAuthUserId: string,
    email: string,
    name: string | null,
    googleAccountId: string
  ): Promise<{ userId: string; tenantId: string }> {
    // 1. Extract domain from email
    const domain = email.split('@')[1];
    if (!domain) {
      throw new Error(`Invalid email format: ${email}`);
    }

    // 2. Find tenantId via company domain lookup
    let tenantId: string;
    
    // Try to find company by domain (across all tenants first)
    // Note: findByDomain requires tenantId, so we need to search differently
    const company = await this.findCompanyByDomain(domain);
    
    if (company) {
      tenantId = company.tenantId;
      logger.info(
        { email, domain, tenantId },
        'Found tenant via company domain'
      );
    } else {
      // Fallback: Use default tenant or first tenant
      tenantId = await this.getDefaultTenantId();
      logger.warn(
        { email, domain, tenantId },
        'No company found for domain, using default tenant'
      );
    }

    // 3. Check if user exists in users table
    let user = await this.userRepository.findByEmail(tenantId, email);

    if (user) {
      // User exists - link better-auth user
      // Optionally update better_auth_user_id if column exists
      logger.info(
        { userId: user.id, betterAuthUserId, email, tenantId },
        'Linking existing user to better-auth user'
      );
      
      return { userId: user.id, tenantId: user.tenantId };
    }

    // 4. Create new user in users table
    const [firstName, ...lastNameParts] = (name || 'User').split(' ');
    const lastName = lastNameParts.join(' ') || '';

    user = await this.userRepository.create({
      tenantId,
      email,
      firstName: firstName || 'User',
      lastName: lastName || '',
      rowStatus: 0, // Active
    });

    logger.info(
      { userId: user.id, betterAuthUserId, email, tenantId },
      'Created new user from better-auth Google SSO'
    );

    return { userId: user.id, tenantId: user.tenantId };
  }

  /**
   * Find company by domain (searches across all tenants)
   * Note: This is a simplified version - you may need to adjust based on your schema
   */
  private async findCompanyByDomain(domain: string): Promise<{ tenantId: string } | null> {
    // Query customer_domains table directly
    const { customerDomains } = await import('../customers/schema');
    const { eq, ilike } = await import('drizzle-orm');
    
    const result = await this.db
      .select({
        tenantId: customerDomains.tenantId,
      })
      .from(customerDomains)
      .where(ilike(customerDomains.domain, domain.toLowerCase()))
      .limit(1);
    
    return result[0] || null;
  }

  /**
   * Get default tenant ID
   */
  private async getDefaultTenantId(): Promise<string> {
    // Option 1: From environment variable
    const defaultTenantId = process.env.DEFAULT_TENANT_ID;
    if (defaultTenantId) {
      const tenant = await this.tenantRepository.findById(defaultTenantId);
      if (tenant) return defaultTenantId;
    }

    // Option 2: Get first tenant
    const tenants = await this.tenantRepository.findAll();
    if (tenants.length > 0) {
      return tenants[0].id;
    }

    throw new Error('No tenant found and no DEFAULT_TENANT_ID configured');
  }
}
```

#### Step 3.2: Create Better-Auth Hooks

```typescript
// apps/api/src/auth/better-auth-hooks.ts
import { auth } from './better-auth';
import { container } from 'tsyringe';
import { BetterAuthUserService } from './better-auth-user-service';
import { logger } from '../utils/logger';

/**
 * Setup better-auth hooks to automatically link users
 */
export function setupBetterAuthHooks() {
  // Hook: After user signs in with Google
  auth.hooks.after.signIn = async ({ user, account }) => {
    if (account?.provider === 'google' && user.email) {
      try {
        const betterAuthUserService = container.resolve(BetterAuthUserService);
        
        const { userId, tenantId } = await betterAuthUserService.linkBetterAuthUser(
          user.id,
          user.email,
          user.name,
          account.accountId
        );

        logger.info(
          {
            betterAuthUserId: user.id,
            userId,
            tenantId,
            email: user.email,
          },
          'Linked better-auth user to users table after Google SSO'
        );
      } catch (error: any) {
        logger.error(
          { error, betterAuthUserId: user.id, email: user.email },
          'Failed to link better-auth user - sign-in will still succeed'
        );
        // Don't throw - better-auth sign-in should succeed even if linking fails
        // User can be linked manually later
      }
    }
  };

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
```

---

### Phase 4: Create Better-Auth Routes

#### Step 4.1: Create Routes

```typescript
// apps/api/src/auth/better-auth-routes.ts
import { Hono } from 'hono';
import { auth } from './better-auth';

export const betterAuthRoutes = new Hono();

/**
 * Mount better-auth API handler
 * 
 * Handles all better-auth endpoints:
 * - GET /api/auth/sign-in/google - Initiate Google SSO
 * - GET /api/auth/callback/google - Google OAuth callback
 * - GET /api/auth/session - Get current session
 * - POST /api/auth/sign-out - Sign out
 * - POST /api/auth/session/refresh - Refresh session
 */
betterAuthRoutes.all('*', async (c) => {
  const response = await auth.handler(c.req.raw);
  return response;
});
```

#### Step 4.2: Register Routes

```typescript
// apps/api/src/index.ts
import { betterAuthRoutes } from './auth/better-auth-routes';

// Add better-auth routes BEFORE custom auth routes
// Better-auth handles /api/auth/* paths
app.route('/api/auth', betterAuthRoutes);

// Custom auth routes (login, test-token, me, logout)
// These will only handle paths not handled by better-auth
app.route('/api/auth', authRoutes);
```

**Note:** Better-auth routes should be registered first so they handle `/api/auth/sign-in/google`, `/api/auth/callback/google`, etc.

---

### Phase 5: Update Middleware

#### Step 5.1: Update RequestHeader Middleware

```typescript
// apps/api/src/middleware/requestHeader.ts
import { Context, Next } from 'hono';
import { UnauthorizedError } from '@crm/shared';
import type { RequestHeader } from '@crm/shared';
import { auth } from '../auth/better-auth';
import { container } from 'tsyringe';
import { UserRepository } from '../users/repository';
import { logger } from '../utils/logger';

const DEV_TENANT_ID = process.env.DEV_TENANT_ID || '00000000-0000-0000-0000-000000000000';
const DEV_USER_ID = process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000000';

export async function requestHeaderMiddleware(c: Context, next: Next) {
  // 1. Try to get better-auth session
  let session;
  try {
    session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
  } catch (error: any) {
    // Session validation failed
    logger.debug({ error: error.message }, 'Better-auth session validation failed');
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
  
  // First, try to find tenantId by email domain
  const domain = session.user.email?.split('@')[1];
  if (!domain) {
    throw new UnauthorizedError('Invalid email in session');
  }

  // Find company by domain to get tenantId
  const { CompanyRepository } = await import('../customers/repository');
  const companyRepo = container.resolve(CompanyRepository);
  
  // Search for company with this domain (need to search across tenants)
  // For now, try common tenants or use a service method
  const { CompanyService } = await import('../customers/service');
  const companyService = container.resolve(CompanyService);
  
  // Try to find company - this requires tenantId, so we need a different approach
  // Option: Query customer_domains directly
  const { customerDomains } = await import('../customers/schema');
  const { eq, ilike } = await import('drizzle-orm');
  const db = container.resolve('Database');
  
  const domainResult = await db
    .select({ tenantId: customerDomains.tenantId })
    .from(customerDomains)
    .where(ilike(customerDomains.domain, domain.toLowerCase()))
    .limit(1);
  
  const tenantId = domainResult[0]?.tenantId || process.env.DEFAULT_TENANT_ID || DEV_TENANT_ID;
  
  // Get user from users table
  const user = await userRepository.findByEmail(tenantId, session.user.email!);

  if (!user) {
    // User exists in better-auth but not in users table
    // This shouldn't happen if hooks work, but handle gracefully
    logger.warn(
      { betterAuthUserId: session.user.id, email: session.user.email, tenantId },
      'Better-auth user not found in users table - may need manual linking'
    );
    throw new UnauthorizedError('User not found. Please contact support.');
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

**Simplified version** (if you add better_auth_user_id column):

```typescript
// Simpler approach if you add better_auth_user_id to users table
const user = await db
  .select()
  .from(users)
  .innerJoin(betterAuthUser, eq(users.betterAuthUserId, betterAuthUser.id))
  .where(eq(betterAuthUser.id, session.user.id))
  .limit(1);
```

---

### Phase 6: Update DI Container

#### Step 6.1: Register Services & Schemas

```typescript
// apps/api/src/di/container.ts
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
  // Import dynamically to avoid circular dependencies
  import('../auth/better-auth-hooks').then(({ setupBetterAuthHooks }) => {
    setupBetterAuthHooks();
  });
}
```

---

### Phase 7: Update Schemas Export

#### Step 7.1: Export Better-Auth Schemas

```typescript
// apps/api/src/schemas.ts
export { betterAuthUser, betterAuthSession, betterAuthAccount, betterAuthVerification } from './auth/better-auth-schema';
```

---

### Phase 8: Environment Variables

```bash
# .env or .env.local

# Google OAuth (already have)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Better-Auth
BETTER_AUTH_SECRET=your-secret-key-min-32-characters-long
BETTER_AUTH_URL=http://localhost:4000  # Or use SERVICE_API_URL
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4000

# Optional: Default tenant for users without domain mapping
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000000
```

---

## Complete File Checklist

### Files to Create

1. ✅ `sql/better_auth_tables.sql` - Database migration
2. ✅ `apps/api/src/auth/better-auth-schema.ts` - Drizzle schemas
3. ✅ `apps/api/src/auth/better-auth.ts` - Better-auth configuration
4. ✅ `apps/api/src/auth/better-auth-routes.ts` - API routes
5. ✅ `apps/api/src/auth/better-auth-user-service.ts` - User linking service
6. ✅ `apps/api/src/auth/better-auth-hooks.ts` - Hooks setup

### Files to Modify

1. ✅ `apps/api/src/schemas.ts` - Export better-auth schemas
2. ✅ `apps/api/src/di/container.ts` - Register better-auth services & schemas
3. ✅ `apps/api/src/middleware/requestHeader.ts` - Use better-auth sessions
4. ✅ `apps/api/src/index.ts` - Register better-auth routes
5. ✅ `apps/api/package.json` - Add better-auth dependency

### Files to Keep (Optional)

- `apps/api/src/auth/session.ts` - Keep for dev/testing, remove later
- `apps/api/src/auth/routes.ts` - Keep `/api/auth/login` and `/api/auth/test-token` for dev

---

## Implementation Order

### Step 1: Database (5 min)
```bash
# Run migration
psql $DATABASE_URL -f sql/better_auth_tables.sql
```

### Step 2: Install Package (1 min)
```bash
cd apps/api
pnpm add better-auth
```

### Step 3: Create Schemas (10 min)
- Create `better-auth-schema.ts`
- Export in `schemas.ts`
- Add to DI container

### Step 4: Configure Better-Auth (10 min)
- Create `better-auth.ts` config
- Set environment variables
- Test configuration loads

### Step 5: Create Routes (5 min)
- Create `better-auth-routes.ts`
- Register in `index.ts`
- Test routes are accessible

### Step 6: User Linking (20 min)
- Create `better-auth-user-service.ts`
- Create `better-auth-hooks.ts`
- Register in DI container
- Test user creation

### Step 7: Update Middleware (15 min)
- Update `requestHeaderMiddleware`
- Test session validation
- Test tenant isolation

### Step 8: Testing (30 min)
- Test Google SSO flow
- Verify user creation
- Verify session works
- Verify tenant isolation

**Total Estimated Time: ~1.5-2 hours**

---

## Testing Checklist

### Basic Flow
- [ ] Click "Sign in with Google" → Redirects to Google
- [ ] Authorize → Redirects back → Session created
- [ ] User created in `better_auth_user` table
- [ ] User created/linked in `users` table
- [ ] Session cookie set
- [ ] API requests work with session

### User Linking
- [ ] First login → User created in `users` table
- [ ] Second login → Existing user found (no duplicate)
- [ ] Email domain → Correct tenant assigned
- [ ] Unknown domain → Default tenant used

### Session Validation
- [ ] Request with session cookie → Validated
- [ ] Request without session → 401 Unauthorized
- [ ] Request with expired session → 401 Unauthorized
- [ ] Session refresh works (sliding window)

### Tenant Isolation
- [ ] User from tenant A → Can only access tenant A data
- [ ] User from tenant B → Can only access tenant B data
- [ ] Cross-tenant access blocked

---

## Key Implementation Details

### Email → Tenant Mapping Flow

```
1. User logs in with Google → email: "user@acme.com"
2. Extract domain: "acme.com"
3. Query customer_domains table:
   SELECT tenant_id FROM customer_domains WHERE domain = 'acme.com'
4. If found → Use that tenantId
5. If not found → Use DEFAULT_TENANT_ID or first tenant
6. Create/find user in users table with that tenantId
```

### Session Flow

```
1. User → /api/auth/sign-in/google
2. Better-auth → Redirects to Google
3. User authorizes
4. Google → /api/auth/callback/google
5. Better-auth → Creates session in better_auth_session table
6. Hook → Creates/links user in users table
7. Cookie set → Subsequent requests use session
8. Middleware → Validates session → Gets user from users table → Sets RequestHeader
```

### User Linking Strategy

**On First Login:**
- Better-auth creates user in `better_auth_user` table
- Hook calls `linkBetterAuthUser()`
- Service determines tenantId from email domain
- Service creates user in `users` table
- Link via email (unique per tenant)

**On Subsequent Logins:**
- Better-auth finds existing `better_auth_user` by email
- Hook calls `linkBetterAuthUser()`
- Service finds existing user in `users` table by email + tenantId
- No duplicate created

---

## Potential Issues & Solutions

### Issue 1: Email Domain Not Found

**Problem:** User's email domain doesn't match any company domain.

**Solution:**
- Use `DEFAULT_TENANT_ID` environment variable
- Or query all tenants and use first one
- Log warning for manual review

### Issue 2: Multiple Tenants with Same Domain

**Problem:** Same domain exists in multiple tenants (shouldn't happen, but possible).

**Solution:**
- Use first match
- Log warning
- Consider adding domain uniqueness constraint

### Issue 3: Better-Auth User ID Type Mismatch

**Problem:** Better-auth uses `TEXT` IDs, your users use `UUID`.

**Solution:**
- Link via email (unique per tenant)
- Or add `better_auth_user_id TEXT` column to users table

### Issue 4: Session Cookie vs Authorization Header

**Problem:** Better-auth uses cookies, API clients might use headers.

**Solution:**
- Better-auth supports both
- Cookies for browser (automatic)
- Authorization header for API clients (can be configured)

---

## Summary

**Complete plan to enable better-auth Google SSO:**

1. ✅ **Database**: Create better-auth tables + link column
2. ✅ **Install**: `pnpm add better-auth`
3. ✅ **Schemas**: Create Drizzle schemas for better-auth tables
4. ✅ **Config**: Configure better-auth with Google provider
5. ✅ **Routes**: Create better-auth API routes
6. ✅ **Linking**: Create service to link better-auth users to `users` table
7. ✅ **Hooks**: Setup hooks to auto-link on Google SSO
8. ✅ **Middleware**: Update to use better-auth sessions
9. ✅ **Testing**: Test end-to-end flow

**Key Points:**
- Better-auth manages auth (better_auth_user, better_auth_session, better_auth_account)
- Your `users` table stores business data (tenantId, firstName, lastName, etc.)
- Link via email (unique per tenant)
- Determine tenantId from email domain → customer_domains → tenant
- Keep existing tenant isolation logic

**Estimated Time:** 1.5-2 hours for complete implementation
