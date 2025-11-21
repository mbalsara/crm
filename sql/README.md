# CRM Database Schema

This directory contains the SQL schema files for the CRM database, split into individual files for easier management.

## Connection String

```
postgresql://neondb_owner:npg_1gHnfsaiR8Fz@ep-odd-thunder-a88b2g71-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require
```

## Execution Order

Execute files in the following order to set up the database from scratch:

1. **tenants.sql** - Create tenants table
2. **users.sql** - Create users table
3. **integrations.sql** - Create integrations table (includes integration_source and integration_auth_type enums)
4. **companies.sql** - Create companies table (references tenants)
5. **company_domains.sql** - Create company_domains table (references companies and tenants, supports multiple domains per company)
6. **contacts.sql** - Create contacts table (references tenants and companies)
7. **email_threads.sql** - Create email_threads table (provider-agnostic threads)
8. **emails.sql** - Create emails table with indexes (provider-agnostic, references email_threads)
9. **thread_analyses.sql** - Create thread_analyses table (thread-level summaries for analysis context, references email_threads)
10. **email_analyses.sql** - Create email_analyses table (stores analysis results for emails, references emails and tenants)
11. **runs.sql** - Create runs table with foreign keys and indexes (includes run_status and run_type enums)

## File Structure

- `tenants.sql` - Tenants table
- `users.sql` - Users table
- `integrations.sql` - Integrations table + integration enums (integration_source, integration_auth_type)
- `companies.sql` - Companies table (references tenants, domain info stored in company_domains table)
- `company_domains.sql` - Company domains table (references companies and tenants, unique constraint on tenant_id + domain)
- `contacts.sql` - Contacts table (references tenants and companies, unique constraint on tenant_id + email)
- `email_threads.sql` - Email threads table (provider-agnostic, references tenants and integrations)
- `thread_analyses.sql` - Thread analyses table (thread-level summaries for each analysis type, references email_threads)
- `emails.sql` - Emails table (provider-agnostic, references email_threads, with unique constraint on tenant_id + provider + message_id)
- `email_analyses.sql` - Email analyses table (stores analysis results for emails, references emails and tenants, unique constraint on email_id + analysis_type)
- `runs.sql` - Runs table + run enums (run_status, run_type) with foreign key to integrations

## Notes

- Each file includes `DROP TABLE IF EXISTS` and `DROP TYPE IF EXISTS` statements for idempotency
- Enums are defined in the same file as the tables that use them:
  - `integrations.sql`: `integration_source`, `integration_auth_type`
  - `runs.sql`: `run_status`, `run_type`
- The `company_domains` table has a unique constraint: `CONSTRAINT uniq_company_domains_tenant_domain UNIQUE (tenant_id, domain)` - ensures each domain is unique per tenant across all companies
- Domains are automatically lowercased in the API layer (repository methods)
- The `contacts` table has a unique constraint: `CONSTRAINT uniq_contacts_tenant_email UNIQUE (tenant_id, email)`
- The `emails` table has a unique constraint: `CONSTRAINT uniq_emails_tenant_provider_message UNIQUE (tenant_id, provider, message_id)`
- The `email_threads` table has a unique constraint: `CONSTRAINT uniq_thread_tenant_integration UNIQUE (tenant_id, integration_id, provider_thread_id)`
- The `email_analyses` table has a unique constraint: `CONSTRAINT uniq_email_analysis_type UNIQUE (email_id, analysis_type)` - ensures one analysis result per email per analysis type
- The `thread_analyses` table has a unique constraint: `CONSTRAINT uniq_thread_analysis_type UNIQUE (thread_id, analysis_type)` - ensures one thread summary per thread per analysis type
- The `contacts` table has a foreign key reference to `companies(id)` with SET NULL on delete
- The `emails` table has a foreign key reference to `email_threads(id)` with CASCADE delete
- The `email_analyses` table has a foreign key reference to `emails(id)` with CASCADE delete
- The `thread_analyses` table has a foreign key reference to `email_threads(id)` with CASCADE delete
- The `runs` table has a foreign key reference to `integrations(id)`
- Dependencies: `companies` → `tenants`, `contacts` → `tenants` and `companies`, `email_threads` → `integrations`, `emails` → `email_threads`, `thread_analyses` → `email_threads`, `email_analyses` → `emails` and `tenants`, `runs` → `integrations`

## Command Line Execution

```bash
# Execute all files in order
psql $DATABASE_URL -f sql/tenants.sql
psql $DATABASE_URL -f sql/users.sql
psql $DATABASE_URL -f sql/integrations.sql
psql $DATABASE_URL -f sql/companies.sql
psql $DATABASE_URL -f sql/company_domains.sql
psql $DATABASE_URL -f sql/contacts.sql
psql $DATABASE_URL -f sql/email_threads.sql
psql $DATABASE_URL -f sql/emails.sql
psql $DATABASE_URL -f sql/thread_analyses.sql
psql $DATABASE_URL -f sql/email_analyses.sql
psql $DATABASE_URL -f sql/runs.sql
```

Or in PostgreSQL interactive mode:

```sql
\i sql/tenants.sql
\i sql/users.sql
\i sql/integrations.sql
\i sql/companies.sql
\i sql/contacts.sql
\i sql/email_threads.sql
\i sql/emails.sql
\i sql/thread_analyses.sql
\i sql/email_analyses.sql
\i sql/runs.sql
```

## Verification Queries

Check all tables:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
```

Check all enums:
```sql
SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname;
```

Check all indexes:
```sql
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname;
```
