/**
 * Verify Sync Script
 * Run with: npx tsx scripts/verify-sync.ts
 */

import postgres from 'postgres';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_1gHnfsaiR8Fz@ep-odd-thunder-a88b2g71-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require';

const sql = postgres(DATABASE_URL);

interface TableCount {
  table_name: string;
  count: number;
}

async function main() {
  console.log('\n=== Database Verification ===\n');

  // 1. Table counts
  console.log('1. TABLE COUNTS:');
  const counts = await sql<TableCount[]>`
    SELECT 'tenants' as table_name, COUNT(*)::int as count FROM tenants
    UNION ALL SELECT 'users', COUNT(*)::int FROM users
    UNION ALL SELECT 'customers', COUNT(*)::int FROM customers
    UNION ALL SELECT 'customer_domains', COUNT(*)::int FROM customer_domains
    UNION ALL SELECT 'contacts', COUNT(*)::int FROM contacts
    UNION ALL SELECT 'email_threads', COUNT(*)::int FROM email_threads
    UNION ALL SELECT 'emails', COUNT(*)::int FROM emails
    UNION ALL SELECT 'email_participants', COUNT(*)::int FROM email_participants
    UNION ALL SELECT 'email_analyses', COUNT(*)::int FROM email_analyses
    UNION ALL SELECT 'integrations', COUNT(*)::int FROM integrations
    ORDER BY table_name
  `;

  for (const row of counts) {
    console.log(`   ${row.table_name}: ${row.count}`);
  }

  // 2. Email date range (verify 30 days)
  console.log('\n2. EMAIL DATE RANGE:');
  const dateRange = await sql`
    SELECT
      MIN(received_at) as oldest_email,
      MAX(received_at) as newest_email,
      EXTRACT(DAY FROM (MAX(received_at) - MIN(received_at))) as days_span
    FROM emails
  `;
  if (dateRange[0]) {
    console.log(`   Oldest: ${dateRange[0].oldest_email}`);
    console.log(`   Newest: ${dateRange[0].newest_email}`);
    console.log(`   Days span: ${dateRange[0].days_span}`);
  }

  // 3. Customers created (sample)
  console.log('\n3. SAMPLE CUSTOMERS:');
  const customers = await sql`
    SELECT c.id, c.name, cd.domain, c.created_at
    FROM customers c
    LEFT JOIN customer_domains cd ON c.id = cd.customer_id
    ORDER BY c.created_at DESC
    LIMIT 5
  `;
  for (const c of customers) {
    console.log(`   ${c.name || '(no name)'} - ${c.domain}`);
  }

  // 4. Contacts created (sample)
  console.log('\n4. SAMPLE CONTACTS:');
  const contacts = await sql`
    SELECT c.email, c.name, c.title, cu.name as customer_name
    FROM contacts c
    LEFT JOIN customers cu ON c.customer_id = cu.id
    ORDER BY c.created_at DESC
    LIMIT 5
  `;
  for (const c of contacts) {
    console.log(`   ${c.email} - ${c.name || '(no name)'} - ${c.title || '(no title)'} @ ${c.customer_name || '(no customer)'}`);
  }

  // 5. Email participants (sample)
  console.log('\n5. EMAIL PARTICIPANTS SAMPLE:');
  const participants = await sql`
    SELECT
      ep.email,
      ep.participant_type,
      ep.direction,
      cu.name as customer_name
    FROM email_participants ep
    LEFT JOIN customers cu ON ep.customer_id = cu.id
    ORDER BY ep.created_at DESC
    LIMIT 5
  `;
  for (const p of participants) {
    console.log(`   ${p.email} (${p.participant_type}/${p.direction}) -> ${p.customer_name || 'no customer'}`);
  }

  // 6. Users from emails
  console.log('\n6. USERS:');
  const users = await sql`
    SELECT id, email, first_name, last_name, row_status
    FROM users
    ORDER BY created_at DESC
    LIMIT 5
  `;
  for (const u of users) {
    console.log(`   ${u.email} - ${u.first_name} ${u.last_name} (status: ${u.row_status})`);
  }

  // 7. Analysis results
  console.log('\n7. ANALYSIS RESULTS BY TYPE:');
  const analyses = await sql`
    SELECT analysis_type, COUNT(*)::int as count
    FROM email_analyses
    GROUP BY analysis_type
    ORDER BY count DESC
  `;
  for (const a of analyses) {
    console.log(`   ${a.analysis_type}: ${a.count}`);
  }

  // 8. Emails with sentiment
  console.log('\n8. EMAILS WITH SENTIMENT:');
  const sentimentStats = await sql`
    SELECT
      sentiment,
      COUNT(*)::int as count,
      ROUND(AVG(sentiment_score::numeric), 2) as avg_score
    FROM emails
    WHERE sentiment IS NOT NULL
    GROUP BY sentiment
    ORDER BY count DESC
  `;
  for (const s of sentimentStats) {
    console.log(`   ${s.sentiment}: ${s.count} emails (avg score: ${s.avg_score})`);
  }

  // 9. Analysis status
  console.log('\n9. EMAIL ANALYSIS STATUS:');
  const statusStats = await sql`
    SELECT
      analysis_status,
      COUNT(*)::int as count
    FROM emails
    GROUP BY analysis_status
    ORDER BY analysis_status
  `;
  const statusMap: Record<number, string> = {
    1: 'pending',
    2: 'processing',
    3: 'completed',
    4: 'failed'
  };
  for (const s of statusStats) {
    console.log(`   ${statusMap[s.analysis_status] || s.analysis_status}: ${s.count}`);
  }

  // 10. Contacts with signature data
  console.log('\n10. CONTACTS WITH SIGNATURE DATA:');
  const signatureContacts = await sql`
    SELECT
      COUNT(*)::int as total,
      COUNT(title)::int as with_title,
      COUNT(phone)::int as with_phone,
      COUNT(linkedin)::int as with_linkedin
    FROM contacts
  `;
  if (signatureContacts[0]) {
    const s = signatureContacts[0];
    console.log(`   Total contacts: ${s.total}`);
    console.log(`   With title: ${s.with_title}`);
    console.log(`   With phone: ${s.with_phone}`);
    console.log(`   With LinkedIn: ${s.with_linkedin}`);
  }

  // 11. Verify email_participants links
  console.log('\n11. EMAIL_PARTICIPANTS INTEGRITY:');
  const participantStats = await sql`
    SELECT
      COUNT(*)::int as total_participants,
      COUNT(DISTINCT email_id)::int as unique_emails,
      COUNT(customer_id)::int as with_customer,
      COUNT(CASE WHEN participant_type = 'user' THEN 1 END)::int as users,
      COUNT(CASE WHEN participant_type = 'contact' THEN 1 END)::int as contacts
    FROM email_participants
  `;
  if (participantStats[0]) {
    const p = participantStats[0];
    console.log(`   Total participants: ${p.total_participants}`);
    console.log(`   Unique emails: ${p.unique_emails}`);
    console.log(`   With customer link: ${p.with_customer}`);
    console.log(`   User participants: ${p.users}`);
    console.log(`   Contact participants: ${p.contacts}`);
  }

  // 12. Check for orphaned data
  console.log('\n12. DATA INTEGRITY CHECKS:');

  const orphanedEmails = await sql`
    SELECT COUNT(*)::int as count
    FROM emails e
    LEFT JOIN email_threads t ON e.thread_id = t.id
    WHERE t.id IS NULL
  `;
  console.log(`   Emails without threads: ${orphanedEmails[0]?.count || 0}`);

  const emailsWithoutParticipants = await sql`
    SELECT COUNT(*)::int as count
    FROM emails e
    LEFT JOIN email_participants ep ON e.id = ep.email_id
    WHERE ep.id IS NULL
  `;
  console.log(`   Emails without participants: ${emailsWithoutParticipants[0]?.count || 0}`);

  const contactsWithoutCustomer = await sql`
    SELECT COUNT(*)::int as count
    FROM contacts
    WHERE customer_id IS NULL
  `;
  console.log(`   Contacts without customer: ${contactsWithoutCustomer[0]?.count || 0}`);

  console.log('\n=== Verification Complete ===\n');

  await sql.end();
}

main().catch(console.error);
