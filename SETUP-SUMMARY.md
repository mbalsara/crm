# GitHub Actions Setup Summary

I've updated the GitHub Actions workflow to match your existing setup from the health project.

## Changes Made

### 1. Updated Secret Names

The workflow now uses the same secret names as your health project:

| Old Secret Name | New Secret Name |
|----------------|-----------------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `WIF_PROVIDER` |
| `GCP_SERVICE_ACCOUNT` | `WIF_SERVICE_ACCOUNT` |
| `GCP_PROJECT_ID` | `GCP_PROJECT_ID` (unchanged) |
| ~~`GCP_REGION`~~ | Removed (hardcoded to us-central1) |

### 2. Hardcoded Region

- Region is now hardcoded to `us-central1` in the workflow (matching your health project)
- No need for a `GCP_REGION` secret

### 3. Added Deployment Summaries

Each successful deployment now shows a nice summary with:
- Service URL
- Region
- Docker image tag

## GitHub Secrets You Need

Since you already have these set up for the health project, you can use the same values:

### Required Secrets (3 total)

Add these in: GitHub Repository → Settings → Secrets and variables → Actions

1. **`GCP_PROJECT_ID`**
   - Your Google Cloud project ID
   - Example: `my-crm-project-12345`

2. **`WIF_PROVIDER`**
   - Workload Identity Federation provider path
   - Example: `projects/123456789/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider`
   - Get this from your health project if you're using the same GCP project

3. **`WIF_SERVICE_ACCOUNT`**
   - Service account email for deployments
   - Example: `github-actions-sa@my-crm-project-12345.iam.gserviceaccount.com`

## Quick Setup Steps

### Option A: Using Same GCP Project as Health

If you're deploying to the same GCP project:

1. Copy the 3 secrets from your health repository
2. Add them to this CRM repository
3. Create the Artifact Registry repository:
   ```bash
   gcloud artifacts repositories create crm \
     --repository-format=docker \
     --location=us-central1 \
     --description="CRM application container images"
   ```
4. Create secrets in Secret Manager:
   ```bash
   # Database URL
   echo -n "your-database-url" | gcloud secrets create DATABASE_URL --data-file=-

   # Inngest keys
   echo -n "your-inngest-event-key" | gcloud secrets create INNGEST_EVENT_KEY --data-file=-
   echo -n "your-inngest-signing-key" | gcloud secrets create INNGEST_SIGNING_KEY --data-file=-
   ```
5. Grant the service account access to secrets:
   ```bash
   export SERVICE_ACCOUNT_EMAIL="your-sa@project.iam.gserviceaccount.com"

   for secret in DATABASE_URL INNGEST_EVENT_KEY INNGEST_SIGNING_KEY; do
     gcloud secrets add-iam-policy-binding $secret \
       --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
       --role="roles/secretmanager.secretAccessor"
   done
   ```
6. Push to main branch

### Option B: Using Different GCP Project

Follow the complete setup in `DEPLOYMENT.md`

## What Gets Deployed

The workflow intelligently deploys based on changes:

- **Packages change** → All 3 services deploy (api, gmail, web)
- **apps/api changes** → Only crm-api deploys
- **apps/gmail changes** → Only crm-gmail deploys
- **apps/web changes** → Only crm-web deploys

## Manual Deployment

You can also trigger deployments manually:

1. Go to: GitHub → Actions → Deploy to Cloud Run
2. Click "Run workflow"
3. Enter services to deploy:
   - `all` - deploy everything
   - `api` - deploy API only
   - `gmail` - deploy Gmail only
   - `web` - deploy Web only
   - `api,gmail` - deploy both API and Gmail

## Service Details

| Service | Port | Memory | Min/Max Instances |
|---------|------|--------|-------------------|
| crm-api | 4000 | 512Mi | 0/10 |
| crm-gmail | 4001 | 512Mi | 0/10 |
| crm-web | 8080 | 256Mi | 0/10 |

All services:
- Deploy to `us-central1`
- Use Cloud Run (fully managed)
- Allow unauthenticated access
- Scale to zero when idle (min-instances=0)

## Files Created/Modified

```
.github/workflows/deploy.yml     # Main deployment workflow
apps/api/Dockerfile              # API container build
apps/api/.dockerignore           # API build exclusions
apps/gmail/Dockerfile            # Already existed
apps/gmail/.dockerignore         # Already existed
apps/web/Dockerfile              # Web container build (nginx)
apps/web/.dockerignore           # Web build exclusions
apps/web/nginx.conf              # Nginx config for SPA routing
DEPLOYMENT.md                    # Complete setup guide
SETUP-SUMMARY.md                 # This file
```

## Next Steps

1. Add the 3 GitHub secrets
2. Set up GCP resources (Artifact Registry + Secret Manager)
3. Push to main branch
4. Watch the magic happen! ✨

## Troubleshooting

### View deployment logs
```bash
gcloud run services logs read crm-api --region us-central1 --limit 50
```

### Check service status
```bash
gcloud run services describe crm-api --region us-central1
```

### Test health endpoints
```bash
curl https://YOUR-SERVICE-URL/health
```
