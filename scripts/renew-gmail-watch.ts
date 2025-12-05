import 'reflect-metadata';
import { google } from 'googleapis';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { integrations } from '../apps/api/src/integrations/schema';
import { eq, and } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_1gHnfsaiR8Fz@ep-odd-thunder-a88b2g71-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'health-474623';
const GMAIL_PUBSUB_TOPIC = `projects/${GOOGLE_CLOUD_PROJECT}/topics/gmail-notifications`;

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

async function renewWatch() {
  console.log('Fetching Gmail integrations...\n');

  // Get all Gmail integrations
  const gmailIntegrations = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.source, 'gmail'), eq(integrations.isActive, true)));

  if (gmailIntegrations.length === 0) {
    console.log('No Gmail integrations found.');
    return;
  }

  console.log(`Found ${gmailIntegrations.length} Gmail integration(s)\n`);

  for (const integration of gmailIntegrations) {
    console.log('---');
    console.log('Integration ID:', integration.id);
    console.log('Tenant ID:', integration.tenantId);

    // Parse parameters to get credentials
    const params = integration.parameters as Array<{ key: string; value: string }>;
    const paramsMap = new Map(params.map(p => [p.key, p.value]));

    const email = paramsMap.get('email');
    const clientId = paramsMap.get('clientId');
    const clientSecret = paramsMap.get('clientSecret');

    console.log('Email:', email);

    // Get tokens
    const accessToken = integration.accessToken;
    const refreshToken = integration.refreshToken;

    if (!accessToken && !refreshToken) {
      console.log('❌ No tokens available');
      continue;
    }

    try {
      // Create OAuth2 client
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);

      // Set credentials
      if (accessToken) {
        oauth2Client.setCredentials({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      } else {
        oauth2Client.setCredentials({
          refresh_token: refreshToken,
        });
      }

      // Create Gmail client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      console.log('Setting up Gmail watch...');
      console.log('Topic:', GMAIL_PUBSUB_TOPIC);

      // Set up watch
      const watchResponse = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: GMAIL_PUBSUB_TOPIC,
          labelIds: ['INBOX'],
        },
      });

      const historyId = watchResponse.data.historyId;
      const expiration = watchResponse.data.expiration; // Milliseconds since epoch

      if (!expiration) {
        console.log('❌ No expiration returned from Gmail');
        continue;
      }

      const expirationMs = parseInt(expiration, 10);
      const watchExpiresAt = new Date(expirationMs);
      const watchSetAt = new Date();
      const daysUntilExpiry = Math.ceil((watchExpiresAt.getTime() - watchSetAt.getTime()) / (1000 * 60 * 60 * 24));

      console.log('✅ Watch set successfully');
      console.log('History ID:', historyId);
      console.log('Watch Set At:', watchSetAt.toISOString());
      console.log('Watch Expires At:', watchExpiresAt.toISOString());
      console.log('Days Until Expiry:', daysUntilExpiry);

      // Update database with watch info
      await db
        .update(integrations)
        .set({
          watchSetAt,
          watchExpiresAt,
          lastRunToken: historyId || undefined,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, integration.id));

      console.log('✅ Database updated with watch info');

    } catch (error: any) {
      console.error('❌ Failed to renew watch:', error.message);
      if (error.response?.data) {
        console.error('Error details:', JSON.stringify(error.response.data, null, 2));
      }
    }
    console.log();
  }
}

renewWatch().catch(console.error);
