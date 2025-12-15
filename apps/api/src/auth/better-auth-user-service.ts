import { injectable, inject } from 'tsyringe';
import { eq, ilike, and } from 'drizzle-orm';
import type { Database } from '@crm/database';
import { UserRepository } from '../users/repository';
import { companyDomains } from '../companies/schema';
import { users } from '../users/schema';
import { betterAuthUser } from './better-auth-schema';
import { logger } from '../utils/logger';

@injectable()
export class BetterAuthUserService {
  // Cache for tenant resolution (optimization - Issue #2)
  private tenantCache = new Map<string, string>();

  constructor(
    @inject('Database') private db: Database,
    private userRepository: UserRepository
  ) {}

  /**
   * Link better-auth user to your users table
   * Determines tenantId from email domain via company_domains table
   * Stores tenantId in better-auth user for fast lookup
   * 
   * ⚠️ ARCHITECTURE: Uses transaction for atomicity (Issue #3)
   */
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

      // 2. Find tenantId via company_domains table (with caching)
      let tenantId = this.tenantCache.get(domain);

      if (!tenantId) {
        const domainResult = await tx
          .select({ tenantId: companyDomains.tenantId })
          .from(companyDomains)
          .where(ilike(companyDomains.domain, domain.toLowerCase()))
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
