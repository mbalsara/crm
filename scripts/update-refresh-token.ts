#!/usr/bin/env tsx

/**
 * Directly update refresh token in database
 *
 * Usage:
 *   DATABASE_URL="..." pnpm tsx scripts/update-refresh-token.ts <tenant-id> <refresh-token>
 */

import 'reflect-metadata';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { integrations } from '../packages/database/src/schema/integrations';
import { eq, and } from 'drizzle-orm';

async function main() {
  const [tenantId, refreshToken] = process.argv.slice(2);

  if (!tenantId || !refreshToken) {
    console.error('Usage: DATABASE_URL="..." pnpm tsx scripts/update-refresh-token.ts <tenant-id> <refresh-token>');
    console.error('\nExample:');
    console.error('  DATABASE_URL="postgresql://..." pnpm tsx scripts/update-refresh-token.ts 019a8e88-7fcb-7235-b427-25b77fed0563 "1//..."');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  try {
    console.log(`\n🔄 Updating refresh token for tenant: ${tenantId}\n`);

    // Connect to database
    const connection = postgres(databaseUrl);
    const db = drizzle(connection);

    // Update refresh token
    const result = await db
      .update(integrations)
      .set({
        token: refreshToken,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrations.tenantId, tenantId),
          eq(integrations.source, 'gmail')
        )
      )
      .returning();

    if (result.length === 0) {
      console.error(`❌ No Gmail integration found for tenant ${tenantId}`);
      process.exit(1);
    }

    console.log('✅ Refresh token updated successfully!\n');
    console.log('Integration details:');
    console.log(`  ID: ${result[0].id}`);
    console.log(`  Tenant ID: ${result[0].tenantId}`);
    console.log(`  Source: ${result[0].source}`);
    console.log(`  Updated At: ${result[0].updatedAt}`);
    console.log(`  Token (first 20 chars): ${refreshToken.substring(0, 20)}...`);

    console.log('\n✅ Done! The Gmail service will use the new refresh token on next sync.\n');

    await connection.end();
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
