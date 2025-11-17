/**
 * Test script to verify Gmail client creation with database credentials
 */
import 'reflect-metadata';
import { container } from '@crm/shared';
import { GmailClientFactory } from '@crm/gmail/services/gmail-client-factory';
import { IntegrationClient } from '@crm/clients';

async function main() {
  const tenantId = '019a8e88-7fcb-7235-b427-25b77fed0563';

  console.log('Testing Gmail client creation...\n');

  try {
    // Get credentials from API
    const integrationClient = container.resolve(IntegrationClient);
    console.log('Step 1: Fetching credentials from API...');
    const credentials = await integrationClient.getCredentials(tenantId, 'gmail');
    console.log('Credentials retrieved:');
    console.log(JSON.stringify(credentials, null, 2));
    console.log();

    // Create Gmail client
    console.log('Step 2: Creating Gmail client...');
    const gmailFactory = container.resolve(GmailClientFactory);
    const gmailClient = await gmailFactory.getClient(tenantId);
    console.log('Gmail client created successfully!');
    console.log();

    // Test a simple Gmail API call
    console.log('Step 3: Testing Gmail API call (get profile)...');
    const profile = await gmailClient.users.getProfile({ userId: 'me' });
    console.log('Profile retrieved:');
    console.log(`  Email: ${profile.data.emailAddress}`);
    console.log(`  Messages Total: ${profile.data.messagesTotal}`);
    console.log(`  Threads Total: ${profile.data.threadsTotal}`);
    console.log();

    console.log('✅ All tests passed!');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

main();
