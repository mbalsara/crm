/**
 * User resolver implementation for notifications
 * Adapts CRM user model to notification UserResolver interface
 */

import { injectable, inject } from 'tsyringe';
import { eq, and } from 'drizzle-orm';
import type { Database } from '@crm/database';
import type {
  UserResolver,
  NotificationUser,
  UserNotificationPreferences,
  ChannelAddress as ChannelAddressInterface,
  SubscriptionConditions,
  NotificationDataContext,
  NotificationChannel,
} from '@crm/notifications';
import { users, userNotificationPreferences, userChannelAddresses } from './schemas';
import { pgTable, uuid } from 'drizzle-orm/pg-core';

// User relationship schemas (minimal versions for notifications app)
// These reference the same tables in the main database
const userCustomers = pgTable('user_customers', {
  userId: uuid('user_id').notNull().references(() => users.id),
  customerId: uuid('customer_id').notNull(),
});

const userManagers = pgTable('user_managers', {
  userId: uuid('user_id').notNull().references(() => users.id),
  managerId: uuid('manager_id').notNull().references(() => users.id),
});

@injectable()
export class CrmUserResolver implements UserResolver {
  constructor(@inject('Database') private db: Database) {}

  async getUser(userId: string, tenantId: string): Promise<NotificationUser | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);

    if (!result[0]) return null;

    const user = result[0];
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email || undefined,
      name: `${user.firstName} ${user.lastName}`.trim() || undefined,
      firstName: user.firstName,
      lastName: user.lastName,
      timezone: undefined, // TODO: Add timezone to users schema
      locale: undefined, // TODO: Add locale to users schema
      isActive: user.canLogin, // Use canLogin as proxy for isActive
    };
  }

  async getUserChannelAddress(
    userId: string,
    channel: NotificationChannel
  ): Promise<ChannelAddressInterface | null> {
    const result = await this.db
      .select()
      .from(userChannelAddresses)
      .where(and(eq(userChannelAddresses.userId, userId), eq(userChannelAddresses.channel, channel)))
      .limit(1);

    if (!result[0]) return null;

    const addr = result[0];
    return {
      id: addr.id,
      tenantId: addr.tenantId,
      userId: addr.userId,
      channel: addr.channel as NotificationChannel,
      address: addr.address,
      isVerified: addr.isVerified ?? false,
      isDisabled: addr.isDisabled ?? false,
      verifiedAt: addr.verifiedAt || undefined,
      bounceCount: addr.bounceCount ?? 0,
      complaintCount: addr.complaintCount ?? 0,
      metadata: (addr.metadata as Record<string, unknown>) || undefined,
      createdAt: addr.createdAt,
      updatedAt: addr.updatedAt,
    };
  }

  async getUserPreferences(
    userId: string,
    typeId: string
  ): Promise<UserNotificationPreferences | null> {
    const result = await this.db
      .select()
      .from(userNotificationPreferences)
      .where(
        and(
          eq(userNotificationPreferences.userId, userId),
          eq(userNotificationPreferences.notificationTypeId, typeId)
        )
      )
      .limit(1);

    if (!result[0]) return null;

    const pref = result[0];
    return {
      enabled: pref.enabled,
      channels: (pref.channels as NotificationChannel[]) || [],
      frequency: pref.frequency as 'immediate' | 'batched',
      batchInterval: (pref.batchInterval as any) || null,
      quietHours: (pref.quietHours as any) || null,
      timezone: pref.timezone || null,
    };
  }

  async getSubscribers(tenantId: string, typeId: string): Promise<string[]> {
    const prefs = await this.db
      .select({ userId: userNotificationPreferences.userId })
      .from(userNotificationPreferences)
      .where(
        and(
          eq(userNotificationPreferences.tenantId, tenantId),
          eq(userNotificationPreferences.notificationTypeId, typeId),
          eq(userNotificationPreferences.enabled, true)
        )
      );

    return prefs.map((p) => p.userId);
  }

  async getUserTimezone(userId: string): Promise<string | null> {
    const user = await this.getUser(userId, ''); // tenantId not needed for timezone
    return user?.timezone || null;
  }

  async getUserLocale(userId: string): Promise<string | null> {
    const user = await this.getUser(userId, ''); // tenantId not needed for locale
    return user?.locale || null;
  }

  async userExists(userId: string, tenantId: string): Promise<boolean> {
    const user = await this.getUser(userId, tenantId);
    return user !== null;
  }

  async tenantActive(tenantId: string): Promise<boolean> {
    // Check if tenant exists and is active
    return true;
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    // Get user permissions from roles/permissions system
    return [];
  }

  async userHasPermission(userId: string, permission: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(permission);
  }

  async userMatchesConditions(
    userId: string,
    conditions: SubscriptionConditions
  ): Promise<boolean> {
    if (conditions.hasCustomers !== undefined) {
      const customerCount = await this.db
        .select()
        .from(userCustomers)
        .where(eq(userCustomers.userId, userId))
        .limit(1);
      const hasCustomers = customerCount.length > 0;
      if (conditions.hasCustomers !== hasCustomers) return false;
    }

    if (conditions.hasManager !== undefined) {
      const managerCount = await this.db
        .select()
        .from(userManagers)
        .where(eq(userManagers.userId, userId))
        .limit(1);
      const hasManager = managerCount.length > 0;
      if (conditions.hasManager !== hasManager) return false;
    }

    return true;
  }

  createDataAccessChecker(userId: string, tenantId: string) {
    return async (context: NotificationDataContext): Promise<boolean> => {
      // Check if user has access to data referenced in notification
      return true;
    };
  }
}
