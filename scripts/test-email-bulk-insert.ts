import 'reflect-metadata';
import { container } from '@crm/shared';
import { EmailClient } from '@crm/clients';
// Import type from API module where schema is defined
import type { NewEmail } from '@crm/api/emails/schema';

/**
 * Test script to verify EmailClient.bulkInsert can reach the API
 *
 * Usage:
 *   SERVICE_API_URL="http://localhost:4000" HTTP_CLIENT_LOGGING="true" \
 *   pnpm tsx scripts/test-email-bulk-insert.ts <tenantId>
 *
 * Example:
 *   SERVICE_API_URL="http://localhost:4000" HTTP_CLIENT_LOGGING="true" \
 *   pnpm tsx scripts/test-email-bulk-insert.ts 019a8e88-7fcb-7235-b427-25b77fed0563
 */

async function main() {
  const tenantId = process.argv[2];

  if (!tenantId) {
    console.error('Usage: pnpm tsx scripts/test-email-bulk-insert.ts <tenantId>');
    process.exit(1);
  }

  console.log('Testing EmailClient.bulkInsert()...');
  console.log('SERVICE_API_URL:', process.env.SERVICE_API_URL);
  console.log('HTTP_CLIENT_LOGGING:', process.env.HTTP_CLIENT_LOGGING || 'false');
  console.log('Tenant ID:', tenantId);
  console.log('');

  // Create test email data (using new schema format)
  // Note: This uses the legacy bulk insert endpoint which requires threadId
  // For new code, use bulkInsertWithThreads with EmailCollection instead
  const testEmails: NewEmail[] = [
    {
      tenantId,
      threadId: '00000000-0000-0000-0000-000000000000', // Dummy thread ID - API will handle this
      provider: 'gmail',
      messageId: `test-message-${Date.now()}-1`,
      subject: 'Test Email 1 - Bulk Insert Test',
      fromEmail: 'test@example.com',
      fromName: 'Test Sender',
      tos: [{ email: 'recipient@example.com', name: 'Test Recipient' }],
      ccs: [],
      bccs: [],
      body: '<p>This is a test email created by the bulk insert test script.</p>',
      priority: 'normal',
      labels: ['INBOX', 'UNREAD'],
      receivedAt: new Date(),
    },
    {
      tenantId,
      threadId: '00000000-0000-0000-0000-000000000000', // Dummy thread ID
      provider: 'gmail',
      messageId: `test-message-${Date.now()}-2`,
      subject: 'Test Email 2 - Bulk Insert Test',
      fromEmail: 'test2@example.com',
      fromName: 'Test Sender 2',
      tos: [{ email: 'recipient2@example.com', name: 'Test Recipient 2' }],
      ccs: [],
      bccs: [],
      body: '<p>This is another test email created by the bulk insert test script.</p>',
      priority: 'normal',
      labels: ['INBOX'],
      receivedAt: new Date(),
    },
  ];

  console.log(`Creating ${testEmails.length} test emails...`);
  console.log('');

  try {
    const emailClient = container.resolve(EmailClient);

    console.log('Calling emailClient.bulkInsert()...');
    const startTime = Date.now();

    const result = await emailClient.bulkInsert(testEmails);

    const duration = Date.now() - startTime;

    console.log('');
    console.log('✅ Success!');
    console.log(`Duration: ${duration}ms`);
    console.log(`Inserted: ${result.insertedCount}`);
    console.log(`Skipped: ${result.skippedCount}`);
    console.log('');
    console.log('Test emails:');
    testEmails.forEach((email, i) => {
      console.log(`  ${i + 1}. ${email.subject} (${email.messageId})`);
    });

  } catch (error: any) {
    console.error('');
    console.error('❌ Error calling bulkInsert:');
    console.error('');
    console.error('Error message:', error.message);
    console.error('');

    if (error.status) {
      console.error('HTTP Status:', error.status);
    }

    if (error.response) {
      // Try to read the error response body
      try {
        const responseText = await error.response.text();
        console.error('Response body:', responseText);

        // Try to parse as JSON
        try {
          const responseJson = JSON.parse(responseText);
          if (responseJson.error) {
            console.error('');
            console.error('API Error Message:', responseJson.error);
          }
        } catch (e) {
          // Not JSON, that's fine
        }
      } catch (e) {
        console.error('Response:', error.response);
      }
    }

    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
