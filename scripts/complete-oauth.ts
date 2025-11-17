#!/usr/bin/env tsx

/**
 * Complete OAuth setup with authorization code
 * Usage: tsx scripts/complete-oauth.ts <auth-code> <credentials-file> <project-id> <tenant-id>
 */

import { google } from 'googleapis';
import * as fs from 'fs';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const [authCode, credentialsPath, projectId, tenantId] = process.argv.slice(2);

if (!authCode || !credentialsPath || !projectId || !tenantId) {
  console.error('Usage: tsx scripts/complete-oauth.ts <auth-code> <credentials-file> <project-id> <tenant-id>');
  process.exit(1);
}

interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

async function main() {
  console.log('🔑 Exchanging authorization code for refresh token...\n');

  const credentialsContent = fs.readFileSync(credentialsPath, 'utf-8');
  const credentialsJson = JSON.parse(credentialsContent);
  const credentials: OAuthCredentials = credentialsJson.web || credentialsJson.installed;

  const oAuth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uris[0]
  );

  const { tokens } = await oAuth2Client.getToken(authCode);

  if (!tokens.refresh_token) {
    throw new Error('No refresh token received');
  }

  console.log('✅ Successfully obtained refresh token!\n');

  const gmailCredentials = {
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: tokens.refresh_token,
  };

  const secretName = `gmail-oauth-${tenantId}`;
  const client = new SecretManagerServiceClient();
  const parent = `projects/${projectId}`;

  try {
    await client.createSecret({
      parent,
      secretId: secretName,
      secret: { replication: { automatic: {} } },
    });
    console.log(`✅ Created secret: ${secretName}`);
  } catch (error: any) {
    if (error.code === 6) {
      console.log(`ℹ️  Secret ${secretName} already exists, will add new version`);
    } else {
      throw error;
    }
  }

  const secretPath = `${parent}/secrets/${secretName}`;
  await client.addSecretVersion({
    parent: secretPath,
    payload: {
      data: Buffer.from(JSON.stringify(gmailCredentials), 'utf8'),
    },
  });

  console.log(`✅ Stored credentials in Secret Manager: ${secretName}\n`);
  console.log('🎉 Setup complete!\n');
  console.log('Your refresh token is now stored and ready to use.');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
