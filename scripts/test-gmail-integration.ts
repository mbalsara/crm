#!/usr/bin/env tsx

/**
 * Gmail Integration Test Script
 *
 * This script tests the full Gmail integration flow:
 * 1. Sets up OAuth credentials (if not already done)
 * 2. Initializes Gmail watch
 * 3. Tests fetching and saving emails to database
 *
 * Usage:
 *   pnpm test:gmail <project-id> [tenant-id]
 *
 * Prerequisites:
 * - OAuth credentials already set up via oauth-setup.ts
 * - Database connection configured
 * - Gmail API enabled
 */

import 'reflect-metadata';
import { SecretClient } from '../packages/cloud/google/src';
import { google, gmail_v1 } from 'googleapis';
import { db } from '../packages/database/src';
import { emails } from '@crm/api/emails/schema';
import { tenants } from '@crm/api/tenants/schema';
import { eq, desc } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

const TENANT_NAME = 'default';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || '';
let TENANT_ID: string;

interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

async function ensureTenant(): Promise<string> {
  console.log('🏢 Ensuring tenant exists...\n');

  const existingTenant = await db.select().from(tenants).where(eq(tenants.name, TENANT_NAME)).limit(1);

  if (existingTenant.length > 0) {
    console.log(`✅ Found existing tenant: ${TENANT_NAME} (${existingTenant[0].id})\n`);
    return existingTenant[0].id;
  }

  const newTenantId = uuidv7();
  await db.insert(tenants).values({
    id: newTenantId,
    name: TENANT_NAME,
  });

  console.log(`✅ Created new tenant: ${TENANT_NAME} (${newTenantId})\n`);
  return newTenantId;
}

async function getGmailClient(): Promise<gmail_v1.Gmail> {
  console.log('🔑 Loading OAuth credentials from Secret Manager...');

  const secretName = `gmail-oauth-${TENANT_NAME}`;
  const secretValue = await SecretClient.getCachedSecretValue(secretName, PROJECT_ID);

  if (!secretValue) {
    throw new Error(`OAuth credentials not found. Run: pnpm oauth:setup first`);
  }

  const credentials: OAuthCredentials = JSON.parse(secretValue);

  const auth = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    'http://localhost'
  );

  auth.setCredentials({
    refresh_token: credentials.refresh_token,
  });

  console.log('✅ OAuth credentials loaded\n');
  return google.gmail({ version: 'v1', auth });
}

async function setupGmailWatch(gmail: gmail_v1.Gmail): Promise<string> {
  console.log('📬 Setting up Gmail watch...');

  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: `projects/${PROJECT_ID}/topics/gmail-notifications`,
      labelIds: ['INBOX'],
    },
  });

  const historyId = response.data.historyId!;
  console.log(`✅ Gmail watch set up successfully`);
  console.log(`   History ID: ${historyId}`);
  console.log(`   Expires: ${new Date(parseInt(response.data.expiration!)).toLocaleString()}\n`);

  return historyId;
}

async function fetchRecentEmails(gmail: gmail_v1.Gmail, maxResults: number = 5) {
  console.log(`📧 Fetching recent ${maxResults} emails...\n`);

  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    labelIds: ['INBOX'],
  });

  if (!response.data.messages || response.data.messages.length === 0) {
    console.log('No emails found in inbox.');
    return [];
  }

  const emailPromises = response.data.messages.map(async (message) => {
    const fullMessage = await gmail.users.messages.get({
      userId: 'me',
      id: message.id!,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Cc', 'Date'],
    });
    return fullMessage.data;
  });

  return await Promise.all(emailPromises);
}

function parseEmailHeader(headers: any[], name: string): string | undefined {
  const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value;
}

function parseEmailAddress(email: string | undefined): { email: string; name?: string } | null {
  if (!email) return null;

  // Parse "Name <email@example.com>" format
  const match = email.match(/(.*?)\s*<(.+?)>/) || email.match(/(.+)/);
  if (!match) return null;

  if (match[2]) {
    return { email: match[2].trim(), name: match[1].trim() || undefined };
  }
  return { email: match[1].trim() };
}

async function saveEmailsToDatabase(messages: gmail_v1.Schema$Message[]) {
  console.log(`💾 Saving ${messages.length} emails to database...\n`);

  let savedCount = 0;
  let skippedCount = 0;

  for (const message of messages) {
    const headers = message.payload?.headers || [];
    const subject = parseEmailHeader(headers, 'Subject');
    const from = parseEmailHeader(headers, 'From');
    const to = parseEmailHeader(headers, 'To');
    const cc = parseEmailHeader(headers, 'Cc');
    const date = parseEmailHeader(headers, 'Date');

    const fromParsed = parseEmailAddress(from);
    const toParsed = parseEmailAddress(to);

    if (!fromParsed || !toParsed) {
      console.log(`⚠️  Skipped: ${subject} (missing from/to)`);
      skippedCount++;
      continue;
    }

    // Note: Body not available with metadata scope
    // To get body, you need gmail.readonly scope and format='full'
    const body = '(Body not available - metadata scope only)';

    try {
      await db.insert(emails).values({
        tenantId: TENANT_ID,
        gmailMessageId: message.id!,
        gmailThreadId: message.threadId!,
        subject: subject || '(no subject)',
        fromEmail: fromParsed.email,
        fromName: fromParsed.name,
        tos: [toParsed],
        ccs: cc ? [parseEmailAddress(cc)!].filter(Boolean) : [],
        bccs: [],
        body: body,
        labels: message.labelIds || [],
        receivedAt: date ? new Date(date) : new Date(parseInt(message.internalDate!)),
      }).onConflictDoNothing();

      console.log(`✅ Saved: ${subject}`);
      console.log(`   From: ${from}`);
      console.log(`   To: ${to}`);
      console.log(`   Date: ${date}\n`);
      savedCount++;
    } catch (error: any) {
      console.error(`❌ Error saving email: ${subject}`);
      console.error(`   Error: ${error.message}\n`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Saved: ${savedCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`   Total: ${messages.length}\n`);
}

async function testEmailRetrieval() {
  console.log('📧 Testing email retrieval from database...\n');

  const recentEmails = await db
    .select()
    .from(emails)
    .where(eq(emails.tenantId, TENANT_ID))
    .orderBy(desc(emails.receivedAt))
    .limit(5);

  console.log(`Found ${recentEmails.length} emails in database:\n`);

  for (const email of recentEmails) {
    console.log(`📨 ${email.subject}`);
    console.log(`   From: ${email.fromName || ''} <${email.fromEmail}>`);
    console.log(`   Received: ${email.receivedAt.toLocaleString()}`);
    console.log(`   Gmail ID: ${email.gmailMessageId}\n`);
  }
}

async function main() {
  console.log('\n🚀 Gmail Integration Test\n');
  console.log('='.repeat(50) + '\n');

  try {
    // Step 0: Ensure tenant exists
    TENANT_ID = await ensureTenant();

    // Step 1: Get Gmail client
    const gmail = await getGmailClient();

    // Step 2: Set up Gmail watch
    const historyId = await setupGmailWatch(gmail);

    // Step 3: Fetch recent emails
    const messages = await fetchRecentEmails(gmail, 5);

    if (messages.length === 0) {
      console.log('No emails to test with. Send yourself a test email first.');
      return;
    }

    // Step 4: Save emails to database
    await saveEmailsToDatabase(messages);

    // Step 5: Test retrieval
    await testEmailRetrieval();

    console.log('✅ Integration test completed successfully!\n');
    console.log('Next steps:');
    console.log('1. Send yourself a test email');
    console.log('2. Gmail will send a Pub/Sub notification');
    console.log('3. Your webhook will process it automatically\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);

    if (error.message.includes('OAuth')) {
      console.error('\nMake sure you run the OAuth setup first:');
      console.error(`  pnpm oauth:setup <credentials.json> ${PROJECT_ID} ${TENANT_ID}`);
    }

    if (error.message.includes('database')) {
      console.error('\nMake sure your database is running and migrations are applied:');
      console.error('  pnpm db:push');
    }

    console.error('\nFull error:', error);
    process.exit(1);
  }
}

main();
