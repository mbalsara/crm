import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { integrations } from '../apps/api/src/db/schema';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_1gHnfsaiR8Fz@ep-odd-thunder-a88b2g71-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

async function checkWatchStatus() {
  console.log('Checking Gmail watch status...\n');

  const gmailIntegrations = await db
    .select({
      tenantId: integrations.tenantId,
      integrationId: integrations.integrationId,
      email: integrations.email,
      watchExpiry: integrations.watchExpiry,
    })
    .from(integrations)
    .where(eq(integrations.provider, 'gmail'));

  if (gmailIntegrations.length === 0) {
    console.log('No Gmail integrations found.');
    return;
  }

  const now = new Date();

  for (const integration of gmailIntegrations) {
    console.log('Integration:', integration.integrationId);
    console.log('Email:', integration.email);
    console.log('Tenant ID:', integration.tenantId);

    if (!integration.watchExpiry) {
      console.log('Watch Status: ❌ NO WATCH SET');
    } else {
      const expiry = new Date(integration.watchExpiry);
      const hoursRemaining = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (expiry < now) {
        console.log('Watch Status: ❌ EXPIRED');
        console.log('Expired:', Math.abs(hoursRemaining).toFixed(2), 'hours ago');
        console.log('Expired At:', expiry.toISOString());
      } else {
        console.log('Watch Status: ✅ Active');
        console.log('Hours Remaining:', hoursRemaining.toFixed(2));
        console.log('Expires At:', expiry.toISOString());
      }
    }
    console.log('\n---\n');
  }
}

checkWatchStatus().catch(console.error);
