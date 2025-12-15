import { injectable, inject } from 'tsyringe';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Database } from '@crm/database';
import { UserRepository } from '../users/repository';
import { tenants } from '../tenants/schema';
import { users } from '../users/schema';
import { betterAuthUser } from './better-auth-schema';
import { logger } from '../utils/logger';

@injectable()
export class BetterAuthUserService {
  constructor(
    @inject('Database') private db: Database,
    private userRepository: UserRepository
  ) {}

  /**
   * Link better-auth user to your users table
   *
   * Security model:
   * 1. Extract domain from user's email
   * 2. Find tenant with matching domain - if no match, reject authentication
   * 3. If user exists in users table, use them
   * 4. If user doesn't exist, auto-provision them for the matched tenant
   *
   * ⚠️ ARCHITECTURE: Uses transaction for atomicity
   */
  async linkBetterAuthUser(
    betterAuthUserId: string,
    email: string,
    name: string | null,
    googleAccountId: string
  ): Promise<{ userId: string; tenantId: string }> {
    // Extract domain from email
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain) {
      throw new Error('Invalid email format');
    }

    return await this.db.transaction(async (tx) => {
      // Step 1: Find tenant by domain match
      const matchingTenant = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.domain, emailDomain))
        .limit(1);

      if (!matchingTenant[0]) {
        // No tenant with matching domain - reject authentication
        logger.error(
          { email, emailDomain, betterAuthUserId },
          'SSO login rejected - no tenant found with matching domain'
        );
        throw new Error(
          `Your organization (${emailDomain}) is not registered in this system. ` +
          `Please contact support if you believe this is an error.`
        );
      }

      const tenantId = matchingTenant[0].id;

      // Step 2: Check if user already exists
      const existingUser = await tx
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      let userId: string;

      if (existingUser[0]) {
        // User exists - verify they belong to the matched tenant
        if (existingUser[0].tenantId !== tenantId) {
          logger.error(
            { email, userTenantId: existingUser[0].tenantId, domainTenantId: tenantId },
            'SSO login rejected - user tenant mismatch'
          );
          throw new Error('Account configuration error. Please contact support.');
        }
        userId = existingUser[0].id;
        logger.info(
          { userId, betterAuthUserId, email, tenantId },
          'Linked existing user to better-auth user via SSO'
        );
      } else {
        // Step 3: Auto-provision new user for this tenant
        userId = uuidv7();

        // Parse name from Google SSO or use email prefix
        const nameParts = (name || email.split('@')[0]).split(' ');
        const firstName = nameParts[0] || email.split('@')[0];
        const lastName = nameParts.slice(1).join(' ') || '';

        await tx.insert(users).values({
          id: userId,
          tenantId,
          email,
          firstName,
          lastName,
        });
        logger.info(
          { userId, betterAuthUserId, email, tenantId },
          'Auto-provisioned new user via SSO'
        );
      }

      // Update better-auth user with tenantId
      await tx
        .update(betterAuthUser)
        .set({ tenantId })
        .where(eq(betterAuthUser.id, betterAuthUserId));

      return { userId, tenantId };
    });
  }
}
