# Gmail Sync Service

Standalone Gmail email sync service for CRM, designed to run on Cloud Run with Inngest for job orchestration.

## Features

- 📧 Gmail API integration with OAuth and Service Account support
- 🔄 Incremental sync using Gmail History API
- 📊 Batch processing with automatic retry and rate limiting
- 🔐 Encrypted credential storage using Secret Manager
- 🚀 Serverless-ready with Inngest for durable execution
- 📝 Comprehensive logging with Pino
- 🐳 Docker container for Cloud Run deployment

## Architecture

```
Gmail Pub/Sub → Webhook → Inngest → Sync Functions → Gmail API → Database
```

### Components

1. **Webhooks**: Receive Gmail push notifications via Pub/Sub
2. **Inngest Functions**: Durable background jobs with retry logic
3. **Services**: Gmail API client, auth, email parsing, sync orchestration
4. **Repositories**: Database access for emails, integrations, sync jobs
5. **Integrations Package**: Encrypted credential management

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- PostgreSQL database
- Google Cloud Project with Gmail API enabled
- Inngest account (or self-hosted)

## Setup

### 1. Database Schema

Run migrations to create tables:

```bash
# From monorepo root
pnpm --filter @crm/database db:push
```

Tables created:

- `tenants` - Tenant information and sync state
- `integrations` - Encrypted OAuth/service account credentials
- `emails` - Synced email data
- `sync_jobs` - Sync job tracking and metrics

### 2. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### 3. Google Cloud Setup

#### For OAuth (Individual Users)

1. Create OAuth 2.0 credentials in Google Cloud Console
2. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`
3. Set up OAuth consent screen

#### For Service Account (Domain-Wide Delegation)

1. Create service account in Google Cloud Console
2. Enable domain-wide delegation
3. Grant scopes in Google Workspace Admin: `https://www.googleapis.com/auth/gmail.readonly`
4. Upload service account key via Integration API

#### For Pub/Sub Webhooks

1. Create Pub/Sub topic: `projects/{project}/topics/gmail-notifications`
2. Grant Gmail service account publish permissions
3. Set up push subscription to your webhook URL
4. Add `PUBSUB_VERIFICATION_TOKEN` to `.env`

### 4. Inngest Setup

1. Sign up at [inngest.com](https://inngest.com) or self-host
2. Get event key and signing key
3. Add to `.env`:
   ```
   INNGEST_EVENT_KEY=...
   INNGEST_SIGNING_KEY=...
   ```

### 5. Secret Manager Setup

Store encryption key in Google Secret Manager:

```bash
echo -n "your-32-char-encryption-key-here" | \
  gcloud secrets create crm-encryption-key \
  --data-file=- \
  --replication-policy="automatic"
```

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start in development mode
pnpm --filter @crm/gmail dev

# Run tests
pnpm --filter @crm/gmail test

# Build
pnpm --filter @crm/gmail build
```

## API Endpoints

### Integrations

```bash
# Create OAuth integration
POST /api/integrations
{
  "tenantId": "tenant-123",
  "authType": "oauth",
  "keys": {
    "accessToken": "ya29...",
    "refreshToken": "1//...",
    "expiresAt": "2024-01-01T00:00:00Z"
  }
}

# Create Service Account integration
POST /api/integrations
{
  "tenantId": "tenant-123",
  "authType": "service_account",
  "keys": {
    "serviceAccountEmail": "sync@project.iam.gserviceaccount.com",
    "serviceAccountKey": { /* JSON key file */ },
    "impersonatedUserEmail": "support@company.com"
  }
}

# Get integration status
GET /api/integrations/:tenantId

# Deactivate integration
DELETE /api/integrations/:tenantId
```

### Sync Operations

```bash
# Trigger incremental sync
POST /api/sync/:tenantId

# Trigger initial sync (last 30 days)
POST /api/sync/:tenantId/initial

# Trigger historical sync (custom date range)
POST /api/sync/:tenantId/historical
{
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z"
}

# Get sync status
GET /api/sync/:tenantId/status

# Get job details
GET /api/sync/:tenantId/jobs/:jobId

# Force sync (debug - bypasses lock)
POST /api/sync/:tenantId/force

# Clear stuck lock
POST /api/sync/:tenantId/unlock
```

### Emails

```bash
# List emails
GET /api/emails?tenantId=tenant-123&limit=50&offset=0

# Get emails by thread
GET /api/emails/thread/:threadId?tenantId=tenant-123
```

### Webhooks

```bash
# Gmail Pub/Sub webhook (called by Google)
POST /webhooks/pubsub
```

## Deployment

### Build Docker Image

```bash
# From monorepo root
docker build -f apps/gmail/Dockerfile -t gmail-sync .
```

### Deploy to Cloud Run

```bash
gcloud run deploy gmail-sync \
  --image gcr.io/your-project/gmail-sync \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=..." \
  --set-env-vars "GOOGLE_CLOUD_PROJECT_ID=..." \
  --set-env-vars "INNGEST_EVENT_KEY=..." \
  --set-env-vars "INNGEST_SIGNING_KEY=..." \
  --max-instances=10 \
  --timeout=600 \
  --memory=512Mi
```

### Configure Pub/Sub Push Subscription

```bash
gcloud pubsub subscriptions create gmail-webhook-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://your-cloud-run-url/webhooks/pubsub \
  --push-auth-service-account=pubsub-invoker@your-project.iam.gserviceaccount.com
```

## Usage Flow

### 1. Onboard Tenant

```bash
# Create integration
curl -X POST https://your-service/api/integrations \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "acme-corp",
    "authType": "oauth",
    "keys": {...}
  }'
```

### 2. Initial Sync

```bash
# Sync last 30 days
curl -X POST https://your-service/api/sync/acme-corp/initial
```

### 3. Set Up Gmail Watch

Use Gmail API to set up push notifications:

```bash
POST https://gmail.googleapis.com/gmail/v1/users/me/watch
{
  "topicName": "projects/your-project/topics/gmail-notifications",
  "labelIds": ["INBOX"]
}
```

### 4. Automatic Incremental Syncs

When new emails arrive:

1. Gmail sends notification to Pub/Sub
2. Pub/Sub pushes to `/webhooks/pubsub`
3. Webhook triggers Inngest function
4. Inngest executes incremental sync with retries

## Monitoring

### Logs

View logs in Google Cloud Console or using `gcloud`:

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gmail-sync" \
  --limit=100 \
  --format=json
```

### Inngest Dashboard

Monitor function executions, retries, and failures at:
https://app.inngest.com

### Sync Job Status

```bash
curl https://your-service/api/sync/tenant-123/status
```

## Troubleshooting

### Sync Stuck

```bash
# Clear lock
curl -X POST https://your-service/api/sync/tenant-123/unlock

# Force sync
curl -X POST https://your-service/api/sync/tenant-123/force
```

### OAuth Token Expired

Tokens are automatically refreshed. Check integration status:

```bash
curl https://your-service/api/integrations/tenant-123
```

### Rate Limiting

Gmail API has quotas. The service automatically retries with exponential backoff. Check quota usage in Google Cloud Console.

## License

MIT
