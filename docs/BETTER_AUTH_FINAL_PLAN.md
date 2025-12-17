# Better-Auth Google SSO - Final Implementation Plan

## Current State

- **Users Table**: `users` (has `email` column, unique per `tenantId`)
- **Email → Tenant Mapping**: Via `customer_domains` table (domain → tenantId)
- **No Password**: Ready for OAuth-only
- **Custom Sessions**: Will replace with better-auth sessions
- **API Port**: 4001 (not 4000)
- **Web Port**: 4000

## Design Decisions ✅

1. **Store `tenantId` in better-auth user table** ✅
   - Add `tenant_id UUID` column to `better_auth_user`
   - Store during user creation/linking (one-time)
   - Read directly from session in middleware

2. **No fallback for missing `tenantId`** ✅
   - If `tenantId` is missing → throw error
   - User must have a company domain mapped

3. **No auto-update of `tenantId`** ✅
   - If user's email domain changes → don't update `tenantId` automatically
   - Manual update required if needed

4. **Automatic user provisioning** ✅
   - On first Google SSO → automatically create user in `users` table
   - Extract name → split into firstName/lastName
   - Set as active (rowStatus = 0)
   - Link to better-auth user via email

---

## Complete Step-by-Step Plan

### Phase 1: Database Setup ✅

#### 1.1 Create Better-Auth Tables

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

### Phase 2: Install & Configure ✅

#### 2.1 Install Package

```bash
cd apps/api
pnpm add better-auth
```

#### 2.2 Create Better-Auth Schema

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
    // Custom field: Store tenantId directly in better-auth user
    tenantId: uuid('tenant_id').references(() => tenants.id),
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

#### 2.3 Create Better-Auth Configuration

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
    expiresIn: 30 * 60, // 30 minutes
    updateAge: 5 * 60,  // Update every 5 minutes (sliding window)
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

### Phase 3: User Linking Service ✅

#### 3.1 Create User Linking Service

**File:** `apps/api/src/auth/better-auth-user-service.ts`

```typescript
import { injectable, inject } from 'tsyringe';
import { container } from 'tsyringe';
import { eq, ilike } from 'drizzle-orm';
import type { Database } from '@crm/database';
import { UserRepository } from '../users/repository';
import { CompanyRepository } from '../customers/repository';
import { TenantRepository } from '../tenants/repository';
import { customerDomains } from '../customers/schema';
import { betterAuthUser } from './better-auth-schema';
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
   * Determines tenantId from email domain via customer_domains table
   * Stores tenantId in better-auth user for fast lookup
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

    // 2. Find tenantId via customer_domains table
    const domainResult = await this.db
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

    const tenantId = domainResult[0].tenantId;
    logger.info(
      { email, domain, tenantId },
      'Found tenant via company domain'
    );

    // 3. Update better-auth user with tenantId (for fast lookup in middleware)
    const { betterAuthUser } = await import('./better-auth-schema');
    await this.db
      .update(betterAuthUser)
      .set({ tenantId })
      .where(eq(betterAuthUser.id, betterAuthUserId));

    // 4. Check if user exists in users table
    let user = await this.userRepository.findByEmail(tenantId, email);

    if (user) {
      // User exists - return existing user
      logger.info(
        { userId: user.id, betterAuthUserId, email, tenantId },
        'Found existing user, linking to better-auth'
      );
      return { userId: user.id, tenantId: user.tenantId };
    }

    // 5. Automatically provision user in users table (design decision #4)
    // Extract name from Google profile
    const [firstName, ...lastNameParts] = (name || 'User').split(' ');
    const lastName = lastNameParts.join(' ') || '';

    user = await this.userRepository.create({
      tenantId,
      email,
      firstName: firstName || 'User',
      lastName: lastName || '',
      rowStatus: 0, // Active by default
    });

    logger.info(
      { userId: user.id, betterAuthUserId, email, tenantId },
      'Automatically provisioned new user from Google SSO'
    );

    return { userId: user.id, tenantId: user.tenantId };
  }

}
```

#### 3.2 Create Better-Auth Hooks

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
 * Possible correct syntax (verify in better-auth docs):
 * - auth.hooks.after.signIn
 * - auth.callbacks.onUserCreated
 * - auth.hooks.onSignIn
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

### Phase 4: Create Routes ✅

#### 4.1 Create Better-Auth Routes

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
betterAuthRoutes.all('*', async (c) => {
  const response = await auth.handler(c.req.raw);
  return response;
});
```

#### 4.2 Register Routes

**File:** `apps/api/src/index.ts`

```typescript
import { betterAuthRoutes } from './auth/better-auth-routes';

// Register better-auth routes FIRST (they handle /api/auth/*)
app.route('/api/auth', betterAuthRoutes);

// Then register custom auth routes (login, test-token, me, logout)
app.route('/api/auth', authRoutes);
```

---

### Phase 5: Update Middleware ✅

#### 5.1 Update RequestHeader Middleware

**File:** `apps/api/src/middleware/requestHeader.ts`

```typescript
import { Context, Next } from 'hono';
import { UnauthorizedError } from '@crm/shared';
import type { RequestHeader } from '@crm/shared';
import { auth } from '../auth/better-auth';
import { container } from 'tsyringe';
import { UserRepository } from '../users/repository';
import { customerDomains } from '../customers/schema';
import { betterAuthUser } from '../auth/better-auth-schema';
import { eq, ilike } from 'drizzle-orm';
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

  // 3. Get tenantId directly from better-auth user (stored during linking)
  // ✅ No database query needed - tenantId is in session (fast!)
  const tenantId = (session.user as any).tenantId;
  const email = session.user.email;
  
  if (!email) {
    throw new UnauthorizedError('Session missing email');
  }

  // 4. Require tenantId - no fallback (design decision #2)
  if (!tenantId) {
    logger.error(
      { betterAuthUserId: session.user.id, email },
      'Better-auth user missing tenantId - user must have company domain mapped'
    );
    throw new UnauthorizedError(
      'User tenant not configured. Please contact support to map your email domain to a company.'
    );
  }

  // 5. Get user from users table (using tenantId from better-auth user)
  // ✅ Only one query needed - tenantId already known from session
  const userRepository = container.resolve(UserRepository);
  const user = await userRepository.findByEmail(tenantId, email);

  if (!user) {
    logger.warn(
      { betterAuthUserId: session.user.id, email, tenantId },
      'Better-auth user not found in users table - may need manual linking'
    );
    throw new UnauthorizedError('User not found. Please contact support.');
  }

  // 5. Create RequestHeader
  const requestHeader: RequestHeader = {
    tenantId: user.tenantId,
    userId: user.id,
  };

  c.set('requestHeader', requestHeader);
  c.set('betterAuthSession', session);

  await next();
}
```

---

### Phase 6: Update DI Container ✅

#### 6.1 Register Services & Schemas

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

#### 6.2 Export Schemas

**File:** `apps/api/src/schemas.ts`

```typescript
export { betterAuthUser, betterAuthSession, betterAuthAccount, betterAuthVerification } from './auth/better-auth-schema';
```

---

### Phase 7: Environment Variables ✅

```bash
# .env or .env.local

# Google OAuth (already have)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Better-Auth
BETTER_AUTH_SECRET=your-secret-key-min-32-characters-long
BETTER_AUTH_URL=http://localhost:4000  # Or SERVICE_API_URL
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4000

# Note: No DEFAULT_TENANT_ID needed - users must have domain mapped (design decision #2)
```

---

## Implementation Checklist

### Database
- [ ] Run `sql/better_auth_tables.sql` migration
- [ ] Verify tables created
- [ ] Verify indexes created

### Code
- [ ] Install better-auth: `pnpm add better-auth`
- [ ] Create `better-auth-schema.ts`
- [ ] Create `better-auth.ts` config
- [ ] Create `better-auth-routes.ts`
- [ ] Create `better-auth-user-service.ts`
- [ ] Create `better-auth-hooks.ts`
- [ ] Update `schemas.ts` to export better-auth schemas
- [ ] Update `di/container.ts` to register services & schemas
- [ ] Update `middleware/requestHeader.ts` to use better-auth sessions
- [ ] Update `index.ts` to register better-auth routes

### Configuration
- [ ] Set `BETTER_AUTH_SECRET` environment variable
- [ ] Set `BETTER_AUTH_URL` environment variable
- [ ] Set `BETTER_AUTH_TRUSTED_ORIGINS` environment variable
- [ ] Set `DEFAULT_TENANT_ID` (optional)

### Testing
- [ ] Test Google SSO flow (`GET /api/auth/sign-in/google`)
- [ ] Verify user created in `better_auth_user` table
- [ ] Verify user created/linked in `users` table
- [ ] Verify session created
- [ ] Test API request with session → Works
- [ ] Test tenant isolation

---

## Key Flow

### Google SSO Login Flow

```
1. User clicks "Sign in with Google"
   → GET /api/auth/sign-in/google
   
2. Better-auth redirects to Google OAuth
   → User authorizes
   
3. Google redirects back
   → GET /api/auth/callback/google?code=...
   
4. Better-auth exchanges code for tokens
   → Creates user in better_auth_user table
   → Creates account in better_auth_account table
   → Creates session in better_auth_session table
   
5. Hook triggers (after.signIn)
   → Calls linkBetterAuthUser()
   → Extracts domain from email
   → Queries customer_domains table
   → Gets tenantId
   → Creates/finds user in users table
   
6. Session cookie set
   → Subsequent requests include cookie
   
7. Middleware validates session
   → Gets better-auth session
   → Extracts email
   → Finds tenantId via customer_domains
   → Gets user from users table
   → Sets RequestHeader
```

### Email → Tenant Mapping

**During User Linking (one-time, on first Google SSO):**
```
Email: "user@acme.com"
  ↓
Extract domain: "acme.com"
  ↓
Query: SELECT tenant_id FROM customer_domains WHERE domain = 'acme.com'
  ↓
If found → Use that tenantId
If not found → Throw error (no fallback - design decision #2)
  ↓
Store tenantId in better_auth_user.tenant_id (for fast lookup)
  ↓
Automatically provision user in users table (design decision #4)
  - Extract firstName/lastName from Google name
  - Set rowStatus = 0 (active)
  - Link via email (unique per tenant)
```

**During Request (every request):**
```
Session → better-auth user → tenantId (directly from better_auth_user.tenant_id)
  ↓
If tenantId missing → Throw error (no fallback - design decision #2)
  ↓
Get user from users table using tenantId + email
```

**Benefits:**
- ✅ No database query to `customer_domains` on every request
- ✅ Faster middleware execution
- ✅ tenantId available directly in session
- ✅ Automatic user provisioning on first SSO
- ✅ Strict validation (no fallback)

---

## Summary

**Complete plan with 6 phases:**

1. ✅ **Database** - Create better-auth tables
2. ✅ **Install** - Install better-auth package
3. ✅ **Schemas** - Create Drizzle schemas
4. ✅ **Config** - Configure better-auth with Google
5. ✅ **Linking** - Create service to link users (email domain → tenantId → users table)
6. ✅ **Middleware** - Update to use better-auth sessions

**Key Points:**
- Better-auth manages auth tables (`better_auth_user`, `better_auth_session`, `better_auth_account`)
- Your `users` table stores business data
- Link via email (unique per tenant)
- Determine tenantId from email domain → `customer_domains` table
- Hooks auto-create/link users on Google SSO

**Estimated Time:** 1.5-2 hours
