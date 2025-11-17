#!/usr/bin/env tsx
/**
 * Script to insert a Gmail integration with encrypted refresh token
 *
 * Usage:
 *   TENANT_ID=xxx EMAIL=xxx CLIENT_ID=xxx CLIENT_SECRET=xxx REFRESH_TOKEN=xxx \
 *   DATABASE_URL=xxx pnpm exec tsx scripts/insert-gmail-integration.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { integrations } from '@crm/api/integrations/schema';
import { encryption } from '../packages/shared/src';
import { v7 as uuidv7 } from 'uuid';

async function main() {
  // Read environment variables
  const tenantId = process.env.TENANT_ID;
  const email = process.env.EMAIL;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const refreshToken = process.env.REFRESH_TOKEN;
  const historyId = process.env.HISTORY_ID;
  const databaseUrl = process.env.DATABASE_URL;

  if (!tenantId || !email || !clientId || !clientSecret || !refreshToken || !databaseUrl) {
    console.error('Missing required environment variables:');
    console.error('  TENANT_ID - The tenant ID');
    console.error('  EMAIL - The Gmail email address');
    console.error('  CLIENT_ID - OAuth client ID');
    console.error('  CLIENT_SECRET - OAuth client secret');
    console.error('  REFRESH_TOKEN - OAuth refresh token');
    console.error('  DATABASE_URL - PostgreSQL connection string');
    console.error('  HISTORY_ID - (Optional) Gmail history ID');
    process.exit(1);
  }

  // Connect to database
  const client = postgres(databaseUrl);
  const db = drizzle(client);

  try {
    // Create parameters array (unencrypted)
    const parameters = [
      { key: 'email', value: email },
      { key: 'clientId', value: clientId },
      { key: 'clientSecret', value: clientSecret },
    ];

    // Encrypt the refresh token
    const encryptedToken = await encryption.encrypt(refreshToken);

    console.log('Inserting Gmail integration...');
    console.log('  Tenant ID:', tenantId);
    console.log('  Email:', email);
    console.log('  Parameters:', parameters);
    console.log('  Encrypted token length:', encryptedToken.length);

    // Insert integration
    const result = await db
      .insert(integrations)
      .values({
        id: uuidv7(),
        tenantId,
        source: 'gmail',
        authType: 'oauth',
        parameters,
        token: encryptedToken,
        tokenExpiresAt: null,
        lastRunToken: historyId || null,
        lastRunAt: historyId ? new Date() : null,
        isActive: true,
        lastUsedAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    console.log('\n✓ Successfully inserted integration:');
    console.log('  ID:', result[0].id);
    console.log('  Tenant ID:', result[0].tenantId);
    console.log('  Source:', result[0].source);
    console.log('  Parameters:', result[0].parameters);
    console.log('  Token (first 20 chars):', result[0].token?.substring(0, 20) + '...');
    console.log('  Last Run Token:', result[0].lastRunToken);

  } catch (error) {
    console.error('Failed to insert integration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
