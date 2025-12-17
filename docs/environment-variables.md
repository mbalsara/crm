# Environment Variables Guide

This document lists all environment variables used in the CRM system, organized by service.

## Quick Reference

| Variable | Required | Services | Description |
|----------|----------|----------|-------------|
| `DATABASE_URL` | Yes | api | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Yes | api, gmail | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | api, gmail | Google OAuth client secret |
| `SERVICE_API_URL` | Yes | api, gmail, analysis | Public URL of the API service |
| `SERVICE_GMAIL_URL` | Yes | api | Internal URL of the Gmail service |
| `SERVICE_ANALYSIS_URL` | Yes | api | Internal URL of the Analysis service |
| `INTERNAL_API_KEY` | Yes | api, gmail, analysis | Service-to-service authentication key |
| `WEB_URL` | Yes (prod) | api | Public URL of the web frontend |
| `GMAIL_PUBSUB_TOPIC` | Yes | gmail | Google Pub/Sub topic for Gmail webhooks |
| `ENCRYPTION_SECRET` | Yes | api | Secret for encrypting OAuth tokens |
| `BETTER_AUTH_SECRET` | Yes (prod) | api | Secret for better-auth sessions |

---

## API Service (`crm-api`)

### Required Variables

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require` | PostgreSQL connection string (Neon) |
| `GOOGLE_CLIENT_ID` | `123456789.apps.googleusercontent.com` | Google OAuth 2.0 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxx` | Google OAuth 2.0 client secret |
| `SERVICE_GMAIL_URL` | `https://crm-gmail-xxx.run.app` | URL of the Gmail sync service |
| `SERVICE_ANALYSIS_URL` | `https://crm-analysis-xxx.run.app` | URL of the Analysis service |
| `SERVICE_API_URL` | `https://crm-api-xxx.run.app` | Public URL of this API service (used for OAuth callbacks) |
| `INTERNAL_API_KEY` | `<random-32-char-hex>` | Shared secret for service-to-service auth (generate with `openssl rand -hex 32`) |
| `ENCRYPTION_SECRET` | `<random-32-char-hex>` | Secret for encrypting OAuth tokens in database |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4001` | Port to listen on |
| `WEB_URL` | `http://localhost:4000` | URL of the web frontend (for OAuth redirects) |
| `BETTER_AUTH_SECRET` | Falls back to `SESSION_SECRET` | Secret for better-auth session tokens |
| `SESSION_SECRET` | `dev-secret...` (dev only) | Legacy session secret |
| `SESSION_DURATION_MS` | `1800000` (30 min) | Session duration in milliseconds |
| `NODE_ENV` | `development` | Environment (`development` or `production`) |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `ALLOW_DEV_AUTH` | `false` | Allow dev auth bypass (development only) |
| `DEV_TENANT_ID` | `00000000-...` | Default tenant ID for dev auth |
| `DEV_USER_ID` | `00000000-...` | Default user ID for dev auth |
| `TEST_TOKEN_API_KEY` | - | API key for generating test tokens (dev only) |

---

## Gmail Sync Service (`crm-gmail`)

### Required Variables

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `SERVICE_API_URL` | `https://crm-api-xxx.run.app` | URL of the API service (for fetching integrations) |
| `INTERNAL_API_KEY` | `<same-as-api>` | **Must match API service** - used for service-to-service auth |
| `GOOGLE_CLIENT_ID` | `123456789.apps.googleusercontent.com` | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxx` | Google OAuth 2.0 client secret |
| `GMAIL_PUBSUB_TOPIC` | `projects/my-project/topics/gmail-notifications` | Pub/Sub topic for Gmail push notifications |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4002` | Port to listen on |
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `info` | Logging level |
| `PUBSUB_VERIFICATION_TOKEN` | - | Token to verify Pub/Sub push messages |

---

## Analysis Service (`crm-analysis`)

### Required Variables

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `SERVICE_API_URL` | `https://crm-api-xxx.run.app` | URL of the API service (for creating customers/contacts) |
| `INTERNAL_API_KEY` | `<same-as-api>` | **Must match API service** - used for service-to-service auth |
| `OPENAI_API_KEY` | `sk-...` | OpenAI API key for GPT models |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Anthropic API key for Claude models (optional if using OpenAI) |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4003` | Port to listen on |
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `info` | Logging level |
| `LANGFUSE_ENABLED` | `false` | Enable Langfuse tracing |
| `LANGFUSE_SECRET_KEY` | - | Langfuse secret key |
| `LANGFUSE_PUBLIC_KEY` | - | Langfuse public key |
| `LANGFUSE_BASE_URL` | `https://cloud.langfuse.com` | Langfuse API URL |

---

## Web Frontend (`crm-web`)

The web frontend uses a different configuration approach (typically via `.env` or build-time variables).

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `VITE_API_URL` | `https://crm-api-xxx.run.app` | API service URL |

---

## Shared Packages

### `@crm/database`

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DRIZZLE_LOG` | Enable Drizzle query logging (`true`/`false`) |

### `@crm/encryption`

| Variable | Description |
|----------|-------------|
| `ENCRYPTION_SECRET` | 32-character hex secret for AES-256-GCM encryption |

### `@crm/clients`

| Variable | Description |
|----------|-------------|
| `INTERNAL_API_KEY` | Auto-loaded for service-to-service calls |
| `SERVICE_ANALYSIS_URL` | Used by AnalysisClient |

---

## Cloud Run Deployment

### Setting Environment Variables

```bash
# Set a single variable
gcloud run services update SERVICE_NAME \
  --set-env-vars="VAR_NAME=value"

# Set multiple variables
gcloud run services update SERVICE_NAME \
  --set-env-vars="VAR1=value1,VAR2=value2"

# View current variables
gcloud run services describe SERVICE_NAME \
  --format='yaml(spec.template.spec.containers[0].env)'
```

### Example: Full API Service Setup

```bash
gcloud run services update crm-api \
  --set-env-vars="DATABASE_URL=postgresql://...,\
GOOGLE_CLIENT_ID=123...apps.googleusercontent.com,\
GOOGLE_CLIENT_SECRET=GOCSPX-...,\
SERVICE_API_URL=https://crm-api-xxx.run.app,\
SERVICE_GMAIL_URL=https://crm-gmail-xxx.run.app,\
SERVICE_ANALYSIS_URL=https://crm-analysis-xxx.run.app,\
INTERNAL_API_KEY=abc123...,\
ENCRYPTION_SECRET=def456...,\
WEB_URL=https://crm-web-xxx.run.app,\
BETTER_AUTH_SECRET=ghi789..."
```

### Example: Full Gmail Service Setup

```bash
gcloud run services update crm-gmail \
  --set-env-vars="SERVICE_API_URL=https://crm-api-xxx.run.app,\
INTERNAL_API_KEY=abc123...,\
GOOGLE_CLIENT_ID=123...apps.googleusercontent.com,\
GOOGLE_CLIENT_SECRET=GOCSPX-...,\
GMAIL_PUBSUB_TOPIC=projects/my-project/topics/gmail-notifications"
```

### Example: Full Analysis Service Setup

```bash
gcloud run services update crm-analysis \
  --set-env-vars="SERVICE_API_URL=https://crm-api-xxx.run.app,\
INTERNAL_API_KEY=abc123...,\
OPENAI_API_KEY=sk-...,\
ANTHROPIC_API_KEY=sk-ant-..."
```

---

## Generating Secrets

```bash
# Generate a 32-character hex secret (for INTERNAL_API_KEY, ENCRYPTION_SECRET, etc.)
openssl rand -hex 32

# Generate a 64-character secret (for BETTER_AUTH_SECRET)
openssl rand -hex 64
```

---

## Google Cloud Setup

### OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Create an **OAuth 2.0 Client ID** (Web application)
4. Add authorized redirect URIs:
   - `http://localhost:4001/oauth/gmail/callback` (local dev)
   - `https://crm-api-xxx.run.app/oauth/gmail/callback` (production)
   - `http://localhost:4001/api/auth/callback/google` (better-auth local)
   - `https://crm-api-xxx.run.app/api/auth/callback/google` (better-auth prod)

### Pub/Sub Topic

1. Create a topic: `gcloud pubsub topics create gmail-notifications`
2. Grant Gmail API permission to publish:
   ```bash
   gcloud pubsub topics add-iam-policy-binding gmail-notifications \
     --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```
3. Create a push subscription pointing to your Gmail service webhook endpoint

---

## Local Development

Create a `.env.local` file in each service directory:

### `apps/api/.env.local`

```env
DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SERVICE_API_URL=http://localhost:4001
SERVICE_GMAIL_URL=http://localhost:4002
SERVICE_ANALYSIS_URL=http://localhost:4003
INTERNAL_API_KEY=dev-internal-key-for-local-testing
ENCRYPTION_SECRET=dev-encryption-secret-32chars!!
SESSION_SECRET=dev-session-secret-minimum-32-characters
WEB_URL=http://localhost:4000
```

### `apps/gmail/.env.local`

```env
SERVICE_API_URL=http://localhost:4001
INTERNAL_API_KEY=dev-internal-key-for-local-testing
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GMAIL_PUBSUB_TOPIC=projects/my-project/topics/gmail-notifications
```
