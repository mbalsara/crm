import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import { container } from 'tsyringe';
import type { Database } from '@crm/database';
import {
  betterAuthUser,
  betterAuthSession,
  betterAuthAccount,
  betterAuthVerification,
} from './better-auth-schema';
import { tenants } from '../tenants/schema';
import { BetterAuthUserService } from './better-auth-user-service';
import { logger } from '../utils/logger';

// Lazy getter for database instance from DI container
// This allows better-auth to be imported before container is initialized
function getDb(): Database {
  try {
    return container.resolve<Database>('Database');
  } catch (error) {
    throw new Error('Database not initialized. Make sure setupContainer() is called before using better-auth.');
  }
}

// Lazy initialization - auth instance is created when first accessed
let authInstance: ReturnType<typeof betterAuth> | null = null;

function getAuth() {
  if (!authInstance) {
    const db = getDb();
    authInstance = betterAuth({
      database: drizzleAdapter(db, {
        provider: 'pg', // PostgreSQL provider
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
        // Only enable Google if credentials are provided
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
          ? {
              google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                // Scopes are optional - better-auth uses defaults if not specified
                // scope: [
                //   'openid',
                //   'https://www.googleapis.com/auth/userinfo.email',
                //   'https://www.googleapis.com/auth/userinfo.profile',
                // ],
              },
            }
          : {}),
      },
      session: {
        expiresIn: 30 * 60, // 30 minutes (matches current system)
        updateAge: 5 * 60,  // Update every 5 minutes (sliding window, matches current)
        cookieCache: {
          enabled: true,
        },
      },
      baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:4001', // API runs on 4001
      basePath: '/api/auth', // Better-auth will handle routes under this path
      trustedOrigins: [
        process.env.WEB_URL || 'http://localhost:4000', // Web app runs on 4000
        process.env.SERVICE_API_URL || 'http://localhost:4001', // API runs on 4001
      ].filter(Boolean),
      secret: process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET || 'dev-secret-change-in-production-minimum-32-characters',
      advanced: {
        // Enable cross-origin cookies for separate API/Web domains
        cookies: {
          sameSite: 'none', // Required for cross-origin
          secure: true, // Required when sameSite is 'none'
        },
      },
      databaseHooks: {
        user: {
          create: {
            // Validate domain BEFORE user creation - reject if no matching tenant
            before: async (user: any) => {
              const email = user.email;
              if (!email) {
                throw new Error('Email is required for authentication');
              }

              const emailDomain = email.split('@')[1]?.toLowerCase();
              if (!emailDomain) {
                throw new Error('Invalid email format');
              }

              // Check if any tenant has this domain
              const matchingTenant = await db
                .select()
                .from(tenants)
                .where(eq(tenants.domain, emailDomain))
                .limit(1);

              if (!matchingTenant[0]) {
                logger.error(
                  { email, emailDomain },
                  'SSO login rejected - no tenant found with matching domain'
                );
                throw new Error(
                  `Your organization (${emailDomain}) is not registered in this system. ` +
                  `Please contact support if you believe this is an error.`
                );
              }

              logger.info(
                { email, emailDomain, tenantId: matchingTenant[0].id },
                'Domain validated for SSO - tenant found'
              );

              // Return the user data (unchanged) to allow creation
              return user;
            },
            // After user created, link to our users table and set tenantId
            after: async (user: any, context: any) => {
              const account = context?.account;

              if (user.email && process.env.GOOGLE_CLIENT_ID) {
                try {
                  const betterAuthUserService = container.resolve(BetterAuthUserService);

                  await betterAuthUserService.linkBetterAuthUser(
                    user.id,
                    user.email,
                    user.name || null,
                    account?.accountId || ''
                  );

                  logger.info(
                    { betterAuthUserId: user.id, email: user.email },
                    'Created and linked user after SSO'
                  );
                } catch (error: any) {
                  logger.error(
                    { error: error.message, betterAuthUserId: user.id, email: user.email },
                    'Failed to link user after SSO'
                  );
                  // This error should bubble up - linking is critical
                  throw error;
                }
              }
            },
          },
        },
      },
    });
  }
  return authInstance;
}

// Export auth getter (lazy initialization)
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_target, prop) {
    const authInstance = getAuth();
    const value = authInstance[prop as keyof ReturnType<typeof betterAuth>];
    
    // Debug: Log when handler is accessed
    if (prop === 'handler') {
      console.log('[Better-Auth Proxy] handler accessed, type:', typeof value);
    }
    
    return value;
  },
});
