#!/usr/bin/env tsx

/**
 * Gmail OAuth Setup Script
 *
 * This script helps you authenticate with Gmail API and store credentials in Secret Manager.
 *
 * Prerequisites:
 * 1. OAuth 2.0 Client ID created in Google Cloud Console
 * 2. Downloaded credentials JSON file
 *
 * Usage:
 *   pnpm tsx scripts/oauth-setup.ts <path-to-credentials.json> <project-id> [tenant-id]
 */

import { google } from 'googleapis';
import * as readline from 'readline';
import * as fs from 'fs';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.metadata',
];

interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

async function getRefreshToken(credentials: OAuthCredentials): Promise<string> {
  const { client_id, client_secret, redirect_uris } = credentials;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force to get refresh token
  });

  console.log('\n📧 Gmail OAuth Setup\n');
  console.log('Authorize this app by visiting this URL:');
  console.log('\n' + authUrl + '\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise<string>((resolve) => {
    rl.question('Enter the authorization code: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error('No refresh token received. Make sure you revoke previous access and try again.');
  }

  return tokens.refresh_token;
}

async function storeInSecretManager(
  projectId: string,
  secretName: string,
  secretValue: string
): Promise<void> {
  const client = new SecretManagerServiceClient();
  const parent = `projects/${projectId}`;

  try {
    // Try to create secret
    await client.createSecret({
      parent,
      secretId: secretName,
      secret: {
        replication: {
          automatic: {},
        },
      },
    });
    console.log(`✅ Created secret: ${secretName}`);
  } catch (error: any) {
    if (error.code === 6) {
      // Already exists
      console.log(`ℹ️  Secret ${secretName} already exists, will add new version`);
    } else {
      throw error;
    }
  }

  // Add secret version
  const secretPath = `${parent}/secrets/${secretName}`;
  await client.addSecretVersion({
    parent: secretPath,
    payload: {
      data: Buffer.from(secretValue, 'utf8'),
    },
  });

  console.log(`✅ Stored credentials in Secret Manager: ${secretName}`);
}

async function main() {
  const [credentialsPath, projectId, tenantId] = process.argv.slice(2);

  if (!credentialsPath || !projectId) {
    console.error('Usage: pnpm tsx scripts/oauth-setup.ts <credentials.json> <project-id> [tenant-id]');
    console.error('\nExample:');
    console.error('  pnpm tsx scripts/oauth-setup.ts ~/Downloads/credentials.json health-474623 default');
    process.exit(1);
  }

  if (!fs.existsSync(credentialsPath)) {
    console.error(`Error: Credentials file not found: ${credentialsPath}`);
    process.exit(1);
  }

  const credentialsContent = fs.readFileSync(credentialsPath, 'utf-8');
  const credentialsJson = JSON.parse(credentialsContent);

  // Support both web and installed app credentials
  const credentials: OAuthCredentials =
    credentialsJson.web || credentialsJson.installed;

  if (!credentials) {
    console.error('Error: Invalid credentials file format');
    process.exit(1);
  }

  try {
    // Get refresh token
    const refreshToken = await getRefreshToken(credentials);

    console.log('\n✅ Successfully obtained refresh token!\n');

    // Prepare credentials object
    const gmailCredentials = {
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: refreshToken,
    };

    // Store in Secret Manager
    const secretName = tenantId
      ? `gmail-oauth-${tenantId}`
      : 'gmail-oauth-default';

    await storeInSecretManager(
      projectId,
      secretName,
      JSON.stringify(gmailCredentials)
    );

    console.log('\n🎉 Setup complete!\n');
    console.log('Secret name:', secretName);
    console.log('Project:', projectId);
    console.log('\nYou can now use this in your application.');
    console.log('\nTo test locally, set environment variable:');
    console.log(`  export GMAIL_OAUTH_SECRET=${secretName}`);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);

    if (error.message.includes('refresh_token')) {
      console.error('\nTips:');
      console.error('1. Revoke previous access: https://myaccount.google.com/permissions');
      console.error('2. Make sure OAuth consent screen is in Testing mode');
      console.error('3. Try the authorization flow again');
    }

    process.exit(1);
  }
}

main();
