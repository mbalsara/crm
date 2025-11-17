# GCP Deployment Setup Guide

This document contains all the GCP commands needed to deploy the CRM application to a customer's GCP instance.

## Prerequisites

- Google Cloud Project created
- `gcloud` CLI installed and authenticated
- Billing enabled on the project
- Required APIs enabled (see below)

## Environment Variables

Set these variables before running commands:

```bash
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export GMAIL_SERVICE_URL="https://crm-gmail-XXXXX-uc.a.run.app"  # Will be available after Gmail service deployment
```

## 1. Enable Required APIs

```bash
# Enable Cloud Run API
gcloud services enable run.googleapis.com --project=$PROJECT_ID

# Enable Cloud Build API
gcloud services enable cloudbuild.googleapis.com --project=$PROJECT_ID

# Enable Container Registry API
gcloud services enable containerregistry.googleapis.com --project=$PROJECT_ID

# Enable Pub/Sub API
gcloud services enable pubsub.googleapis.com --project=$PROJECT_ID

# Enable Gmail API
gcloud services enable gmail.googleapis.com --project=$PROJECT_ID

# Enable Secret Manager API (if using secrets)
gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID
```

## 2. Create Pub/Sub Topic for Gmail Notifications

```bash
# Create topic that Gmail will publish notifications to
gcloud pubsub topics create gmail-notifications \
  --project=$PROJECT_ID
```

## 3. Grant Gmail Permission to Publish to Topic

```bash
# Allow Gmail to publish to the topic
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher \
  --project=$PROJECT_ID
```

## 4. Deploy Services to Cloud Run

### Deploy API Service

```bash
# Build and deploy API
gcloud run deploy crm-api \
  --source ./apps/api \
  --platform managed \
  --region=$REGION \
  --allow-unauthenticated \
  --set-env-vars="DATABASE_URL=your-database-url,NODE_ENV=production" \
  --project=$PROJECT_ID
```

### Deploy Gmail Service

```bash
# Build and deploy Gmail service
gcloud run deploy crm-gmail \
  --source ./apps/gmail \
  --platform managed \
  --region=$REGION \
  --allow-unauthenticated \
  --set-env-vars="DATABASE_URL=your-database-url,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,NODE_ENV=production" \
  --project=$PROJECT_ID
```

**After deployment, note the Gmail service URL and update the `GMAIL_SERVICE_URL` variable above.**

### Deploy Web Service

```bash
# Build and deploy Web UI
gcloud run deploy crm-web \
  --source ./apps/web \
  --platform managed \
  --region=$REGION \
  --allow-unauthenticated \
  --set-env-vars="VITE_API_URL=https://your-api-url" \
  --project=$PROJECT_ID
```

## 5. Create Pub/Sub Push Subscription

**IMPORTANT: Run this AFTER deploying the Gmail service to get the service URL**

```bash
# Create push subscription that forwards Gmail notifications to Cloud Run webhook
gcloud pubsub subscriptions create gmail-push-subscription \
  --topic=gmail-notifications \
  --push-endpoint=$GMAIL_SERVICE_URL/webhooks/pubsub \
  --project=$PROJECT_ID
```

## 6. Configure IAM Permissions (Optional but Recommended)

### Create Service Account for Pub/Sub to invoke Cloud Run

```bash
# Create service account
gcloud iam service-accounts create gmail-pubsub-invoker \
  --display-name="Gmail Pub/Sub Invoker" \
  --project=$PROJECT_ID

# Grant Cloud Run Invoker role
gcloud run services add-iam-policy-binding crm-gmail \
  --member="serviceAccount:gmail-pubsub-invoker@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=$REGION \
  --project=$PROJECT_ID

# Update subscription to use service account (optional, for better security)
gcloud pubsub subscriptions update gmail-push-subscription \
  --push-auth-service-account=gmail-pubsub-invoker@$PROJECT_ID.iam.gserviceaccount.com \
  --project=$PROJECT_ID
```

## 7. Database Setup

### Create PostgreSQL Database

If using Cloud SQL:

```bash
# Create Cloud SQL instance
gcloud sql instances create crm-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=$REGION \
  --project=$PROJECT_ID

# Create database
gcloud sql databases create crm \
  --instance=crm-db \
  --project=$PROJECT_ID

# Set root password
gcloud sql users set-password postgres \
  --instance=crm-db \
  --password=YOUR_SECURE_PASSWORD \
  --project=$PROJECT_ID
```

### Run Database Migrations

```bash
# Connect to database and run schema
psql $DATABASE_URL -f sql/schema.sql
```

## 8. Insert Gmail Integration (Per Tenant)

For each tenant that connects Gmail:

```bash
# Use the SQL script to insert integration
# Replace placeholders with actual values
psql $DATABASE_URL -f scripts/insert-gmail-integration.sql
```

Or use the TypeScript script:

```bash
TENANT_ID="tenant-uuid" \
EMAIL="user@example.com" \
CLIENT_ID="oauth-client-id" \
CLIENT_SECRET="oauth-client-secret" \
REFRESH_TOKEN="oauth-refresh-token" \
HISTORY_ID="gmail-history-id" \
DATABASE_URL="postgresql://..." \
pnpm exec tsx scripts/insert-gmail-integration.ts
```

## 9. Setup OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services > Credentials**
3. Click **Create Credentials > OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Add authorized redirect URIs:
   - `http://localhost:3000/auth/callback` (for local development)
   - `https://your-domain.com/auth/callback` (for production)
6. Save Client ID and Client Secret

## 10. Enable Gmail Watch (Per Tenant)

After a tenant connects their Gmail via OAuth:

```bash
# This is typically done via your application code when a user connects Gmail
# The watch needs to be renewed every 7 days (handled by renew-watch Inngest function)
```

## Verification

### Check Deployment Status

```bash
# List Cloud Run services
gcloud run services list --project=$PROJECT_ID

# Check Pub/Sub topic
gcloud pubsub topics list --project=$PROJECT_ID

# Check Pub/Sub subscription
gcloud pubsub subscriptions list --project=$PROJECT_ID

# View logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50 --project=$PROJECT_ID
```

### Test Gmail Webhook

Send a test email to the monitored Gmail account and check:

1. Cloud Run logs for webhook requests
2. Database for new email records
3. Pub/Sub metrics for delivered messages

## Troubleshooting

### No webhooks received

1. Check Pub/Sub subscription exists and points to correct endpoint
2. Verify Gmail API permissions granted
3. Check Cloud Run service allows unauthenticated requests
4. Review Cloud Run logs for errors

### Database connection issues

1. Verify DATABASE_URL environment variable is set
2. Check Cloud SQL instance is running
3. Verify network connectivity (Cloud Run to Cloud SQL)
4. Check database credentials

### OAuth issues

1. Verify OAuth client ID and secret are correct
2. Check redirect URIs match exactly
3. Ensure Gmail API is enabled
4. Verify refresh token is not expired

## Security Recommendations

1. **Use Secret Manager** for sensitive data (database passwords, OAuth secrets)
2. **Enable VPC Connector** for secure database connections
3. **Restrict Cloud Run ingress** to Pub/Sub and load balancer only
4. **Enable audit logging** for compliance
5. **Use service accounts** with minimal required permissions
6. **Implement encryption** for sensitive data in database (currently disabled for simplicity)

## Cost Optimization

1. **Set minimum instances to 0** for Cloud Run services (scale to zero when idle)
2. **Use Cloud SQL read replicas** only if needed
3. **Set Pub/Sub message retention** to reasonable period (7 days default)
4. **Monitor quota usage** to avoid unexpected charges
5. **Use preemptible VMs** for batch processing if applicable

## Maintenance

### Daily Auto-Renewal

The `renewWatch` Inngest function runs daily at 2 AM UTC to renew Gmail watch subscriptions before they expire (7-day expiration).

### Manual Watch Renewal

If needed, manually renew a watch:

```bash
# Use your application's admin API or run a script
pnpm exec tsx scripts/renew-watch.ts
```

### Update Deployments

```bash
# Redeploy a service after code changes
gcloud run deploy SERVICE_NAME \
  --source ./apps/SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID
```
