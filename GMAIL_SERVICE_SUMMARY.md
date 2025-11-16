# Gmail Sync Service - Implementation Summary

## What Was Built

A production-ready Gmail email sync service with the following architecture decisions based on our discussion:

### ✅ Key Decisions Made

1. **Integrations as Shared Package (Option B)** - Chosen over separate API service for better performance and simplicity in monorepo
2. **Secret Manager for Encryption** - Using Google Cloud Secret Manager with 5-minute cache for encryption keys
3. **Both OAuth & Service Account Support** - Flexible authentication for different deployment scenarios
4. **Inngest for Job Orchestration** - Provides built-in retries, rate limiting, and observability
5. **Pino for Logging** - Structured JSON logging for production
6. **AES-256-GCM Encryption** - For securing credentials in database

## Project Structure

```
crm/
├── packages/
│   ├── integrations/          ⭐ NEW - Shared credential management
│   │   ├── src/
│   │   │   ├── repositories/
│   │   │   │   └── integration.repository.ts
│   │   │   └── utils/
│   │   │       ├── encryption.ts       # AES-256-GCM encryption
│   │   │       └── secret-manager.ts   # Google Secret Manager client
│   │   └── package.json
│   │
│   ├── database/              📝 UPDATED - Added new schemas
│   │   └── src/schema/
│   │       ├── tenants.ts              # Tenant & sync state
│   │       ├── integrations.ts         # Encrypted credentials
│   │       ├── emails.ts               # Email data
│   │       └── sync-jobs.ts            # Job tracking
│   │
│   ├── shared/                (existing)
│   └── ui/                    (existing)
│
├── apps/
│   ├── gmail/                 ⭐ NEW - Gmail sync service
│   │   ├── src/
│   │   │   ├── inngest/
│   │   │   │   ├── client.ts
│   │   │   │   └── functions/
│   │   │   │       ├── sync-emails.ts         # Main sync orchestration
│   │   │   │       ├── process-webhook.ts     # Webhook handler
│   │   │   │       └── historical-sync.ts     # Long-running batch sync
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── gmail-auth.service.ts      # OAuth + Service Account
│   │   │   │   ├── gmail.service.ts           # Gmail API + retry logic
│   │   │   │   ├── email-parser.service.ts    # Parse Gmail messages
│   │   │   │   └── sync.service.ts            # Sync + locking
│   │   │   │
│   │   │   ├── repositories/
│   │   │   │   ├── tenant.repository.ts
│   │   │   │   ├── email.repository.ts
│   │   │   │   └── sync-job.repository.ts
│   │   │   │
│   │   │   ├── routes/
│   │   │   │   ├── webhooks.ts                # Pub/Sub webhook
│   │   │   │   ├── sync.ts                    # Sync triggers & status
│   │   │   │   ├── emails.ts                  # Email API
│   │   │   │   └── integrations.ts            # Credential management
│   │   │   │
│   │   │   ├── utils/
│   │   │   │   ├── logger.ts                  # Pino logger
│   │   │   │   └── pubsub.ts                  # Pub/Sub verification
│   │   │   │
│   │   │   ├── di/
│   │   │   │   └── container.ts               # DI setup
│   │   │   │
│   │   │   └── index.ts                       # App entry point
│   │   │
│   │   ├── Dockerfile                          # Cloud Run deployment
│   │   ├── .env.example
│   │   └── README.md                           # Comprehensive docs
│   │
│   ├── web/                   (existing)
│   └── api/                   (existing)
```

## Database Schema

### `tenants`
- Stores tenant info and sync state
- Tracks `syncInProgress` for concurrency control
- Stores `gmailHistoryId` for incremental sync

### `integrations`
- **Encrypted credentials** (OAuth or Service Account)
- Supports multiple sources: gmail, outlook, slack, etc.
- Tracks token expiration and last usage

### `emails`
- Gmail message data with thread support
- Stores HTML (preferred) or plain text
- Includes labels, priority, and all recipients (to/cc/bcc)
- Unique constraint on `(tenantId, gmailMessageId)`

### `sync_jobs`
- Tracks all sync operations
- Metrics: processed, inserted, skipped counts
- Error details for debugging
- History IDs for incremental sync

## Features Implemented

### 🔐 Authentication
- **OAuth Flow**: Automatic token refresh when expired
- **Service Account**: JWT-based authentication for domain-wide delegation
- **Encrypted Storage**: AES-256-GCM encryption with Secret Manager

### 📧 Email Sync
- **Initial Sync**: Last 30 days of emails
- **Incremental Sync**: Uses Gmail History API
- **Historical Sync**: Custom date range, processes in monthly chunks
- **Webhook Sync**: Triggered by Gmail Pub/Sub notifications

### 🔄 Inngest Functions
- **Automatic Retries**: 3 retries with exponential backoff
- **Rate Limiting**: 10 syncs per minute per tenant
- **Durable Execution**: Survives crashes and restarts
- **Step-based Processing**: Each step tracked separately

### 🚀 API Endpoints

#### Integrations
- `POST /api/integrations` - Create/update credentials
- `GET /api/integrations/:tenantId` - Get integration status
- `DELETE /api/integrations/:tenantId` - Deactivate

#### Sync Operations
- `POST /api/sync/:tenantId` - Trigger incremental sync
- `POST /api/sync/:tenantId/initial` - Initial 30-day sync
- `POST /api/sync/:tenantId/historical` - Custom date range
- `GET /api/sync/:tenantId/status` - Sync status & history
- `POST /api/sync/:tenantId/force` - Debug: force sync
- `POST /api/sync/:tenantId/unlock` - Debug: clear stuck lock

#### Emails
- `GET /api/emails?tenantId=x` - List emails
- `GET /api/emails/thread/:threadId` - Get thread

#### Webhooks
- `POST /webhooks/pubsub` - Gmail Pub/Sub endpoint

### 🛡️ Robustness Features

1. **Concurrency Control**: Database-level locking prevents duplicate syncs
2. **Retry Logic**: Exponential backoff for rate limits (429/403 errors)
3. **Batch Processing**: Processes 50 messages at a time
4. **Duplicate Prevention**: `onConflictDoNothing` for idempotency
5. **Stuck Sync Detection**: Auto-override locks older than 30 minutes
6. **Error Tracking**: Full error messages and stack traces in sync_jobs

### 📊 Monitoring & Debugging

1. **Structured Logging**: Pino with tenant ID, job ID, metrics
2. **Inngest Dashboard**: View function executions and retries
3. **Sync Job History**: Track all syncs with detailed metrics
4. **Health Check**: `/health` endpoint for Cloud Run
5. **Debug Endpoints**: Force sync, unlock, job details

## How It Works

### Flow 1: Initial Sync
```
1. POST /api/sync/:tenantId/initial
2. → Inngest event 'gmail/sync.requested'
3. → syncEmails function
   a. Create sync job
   b. Acquire lock
   c. Call syncService.initialSync()
   d. Fetch emails (last 30 days)
   e. Parse and bulk insert
   f. Update history ID
   g. Release lock
4. ← Job completed
```

### Flow 2: Webhook-Triggered Sync
```
1. Gmail sends notification → Pub/Sub
2. Pub/Sub pushes → POST /webhooks/pubsub
3. Verify Pub/Sub token
4. → Inngest event 'gmail/webhook.received'
5. → processWebhook function
6. → Triggers 'gmail/sync.requested' (incremental)
7. → syncEmails function
   a. Fetch history since lastHistoryId
   b. Get new message IDs
   c. Batch fetch full messages
   d. Parse and insert
8. ← Incremental sync complete
```

### Flow 3: OAuth Token Refresh
```
1. Service needs access token
2. → GmailAuthService.getValidAccessToken()
3. Check if token expires < 5 minutes
4. If yes:
   a. Call Google OAuth API with refresh_token
   b. Get new access_token
   c. Update integration in database (encrypted)
   d. Update tokenExpiresAt
5. ← Return valid access token
```

## Next Steps

### 1. Database Setup
```bash
# Create tables
pnpm --filter @crm/database db:push

# Or generate migration
pnpm --filter @crm/database db:generate
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Secrets
```bash
# Store encryption key in Secret Manager
echo -n "your-32-char-key" | \
  gcloud secrets create crm-encryption-key --data-file=-
```

### 4. Set Up Environment
```bash
cp apps/gmail/.env.example apps/gmail/.env
# Edit apps/gmail/.env with your values
```

### 5. Run Locally
```bash
pnpm --filter @crm/gmail dev
```

### 6. Test Integration
```bash
# Create integration
curl -X POST http://localhost:4001/api/integrations \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test-tenant",
    "authType": "oauth",
    "keys": {
      "accessToken": "...",
      "refreshToken": "...",
      "expiresAt": "2024-12-31T23:59:59Z"
    }
  }'

# Trigger initial sync
curl -X POST http://localhost:4001/api/sync/test-tenant/initial

# Check status
curl http://localhost:4001/api/sync/test-tenant/status
```

## Important Notes

### ⚠️ TODO: Tenant Lookup in Webhook
In `/routes/webhooks.ts:42`, you need to implement tenant lookup by email:
```typescript
// Current placeholder:
const tenantId = c.req.query('tenantId') || 'default-tenant-id';

// You should:
// 1. Store email addresses in tenants table, OR
// 2. Add email lookup in integrations, OR
// 3. Include tenantId in Pub/Sub topic name
```

### 🔒 Security Considerations
1. **Encryption Key**: Use Secret Manager in production (implemented)
2. **Pub/Sub Verification**: Implement JWT verification for production
3. **API Authentication**: Add auth middleware to protect endpoints
4. **Rate Limiting**: Already handled by Inngest, but add API rate limiting
5. **Input Validation**: Add request body validation (e.g., Zod)

### 📈 Scaling Considerations
1. **Database Connection Pooling**: Configure Drizzle pool size
2. **Inngest Concurrency**: Adjust rate limits per tenant needs
3. **Cloud Run Instances**: Set `--max-instances` based on load
4. **Gmail API Quotas**: Monitor usage in Google Cloud Console

## Questions for You

1. **Tenant Email Mapping**: How should we map Gmail email addresses to tenantIds? Options:
   - Add `email` field to tenants table
   - Include tenantId in Pub/Sub topic per tenant
   - Use custom Pub/Sub attributes

2. **API Authentication**: Do you want to add authentication to the API endpoints? (JWT, API keys, etc.)

3. **Inngest Hosting**: Will you use:
   - Inngest Cloud (easiest)
   - Self-hosted Inngest

4. **Gmail Watch Renewal**: Gmail watch expires after 7 days. Should we:
   - Add a cron job to renew watches
   - Let tenants manually re-enable
   - Implement auto-renewal on first sync

5. **Error Notifications**: Where should failed sync alerts go?
   - Email
   - Slack
   - Just logs (current implementation)

---

**Implementation Complete!** 🎉

All features requested have been implemented with production-ready patterns including:
- ✅ Option B (shared package) for integrations
- ✅ Secret Manager with caching
- ✅ Both OAuth and Service Account support
- ✅ Inngest for retries and job orchestration
- ✅ Pino for structured logging
- ✅ Comprehensive error handling
- ✅ Docker container for Cloud Run
- ✅ Full API for testing and debugging
