import 'reflect-metadata';
import { container } from '@crm/shared';
import { EmailClient } from '@crm/clients';
// Import type from API module where schema is defined
import type { NewEmail } from '@crm/api/emails/schema';

/**
 * Test script to verify duplicate detection with unique constraint
 *
 * Usage:
 *   SERVICE_API_URL="http://localhost:4000" HTTP_CLIENT_LOGGING="true" \
 *   pnpm tsx scripts/test-email-duplicate-detection.ts <tenantId>
 *
 * Example:
 *   SERVICE_API_URL="http://localhost:4000" HTTP_CLIENT_LOGGING="true" \
 *   pnpm tsx scripts/test-email-duplicate-detection.ts 019a8e88-7fcb-7235-b427-25b77fed0563
 */

async function main() {
  const tenantId = process.argv[2];

  if (!tenantId) {
    console.error('Usage: pnpm tsx scripts/test-email-duplicate-detection.ts <tenantId>');
    process.exit(1);
  }

  console.log('Testing duplicate detection with EmailClient.bulkInsert()...');
  console.log('SERVICE_API_URL:', process.env.SERVICE_API_URL);
  console.log('HTTP_CLIENT_LOGGING:', process.env.HTTP_CLIENT_LOGGING || 'false');
  console.log('Tenant ID:', tenantId);
  console.log('');

  // Create test email data with FIXED message IDs (using new schema format)
  // Note: This uses the legacy bulk insert endpoint
  const testEmails: NewEmail[] = [
    {
      tenantId,
      threadId: '00000000-0000-0000-0000-000000000000', // Dummy thread ID
      provider: 'gmail',
      messageId: 'duplicate-test-message-1', // Fixed ID for duplicate testing
      subject: 'Test Email 1 - Duplicate Detection Test',
      fromEmail: 'test@example.com',
      fromName: 'Test Sender',
      tos: [{ email: 'recipient@example.com', name: 'Test Recipient' }],
      ccs: [],
      bccs: [],
      body: '<p>This email has a fixed message ID for duplicate testing.</p>',
      priority: 'normal',
      labels: ['INBOX', 'UNREAD'],
      receivedAt: new Date(),
    },
    {
      tenantId,
      threadId: '00000000-0000-0000-0000-000000000000', // Dummy thread ID
      provider: 'gmail',
      messageId: 'duplicate-test-message-2', // Fixed ID for duplicate testing
      subject: 'Test Email 2 - Duplicate Detection Test',
      fromEmail: 'test2@example.com',
      fromName: 'Test Sender 2',
      tos: [{ email: 'recipient2@example.com', name: 'Test Recipient 2' }],
      ccs: [],
      bccs: [],
      body: '<p>This email also has a fixed message ID for duplicate testing.</p>',
      priority: 'normal',
      labels: ['INBOX'],
      receivedAt: new Date(),
    },
  ];

  console.log(`Attempting to insert ${testEmails.length} test emails...`);
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

    if (result.skippedCount > 0) {
      console.log('🎉 Duplicate detection is working!');
      console.log(`   ${result.skippedCount} duplicate(s) were skipped.`);
    } else {
      console.log('ℹ️  No duplicates detected (emails were inserted).');
      console.log('   Run this script again to test duplicate detection.');
    }

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
