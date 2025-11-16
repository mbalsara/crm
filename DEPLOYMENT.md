# Cloud Run Deployment Guide

This guide explains how to set up Google Cloud Platform to deploy the CRM application using GitHub Actions.

## Architecture

The application consists of three services:
- **crm-api** (port 4000) - REST API backend
- **crm-gmail** (port 4001) - Gmail integration service
- **crm-web** (port 8080) - React frontend (static files served by nginx)

## Prerequisites

- Google Cloud Platform account
- GitHub repository with the code
- gcloud CLI installed locally (for initial setup)

## Google Cloud Setup

### 1. Create a New Project (or use existing)

```bash
export PROJECT_ID="your-project-id"
gcloud projects create $PROJECT_ID --name="CRM Application"
gcloud config set project $PROJECT_ID
```

### 2. Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com
```

### 3. Create Artifact Registry Repository

```bash
export REGION="us-central1"

gcloud artifacts repositories create crm \
  --repository-format=docker \
  --location=$REGION \
  --description="CRM application container images"
```

**Note:** The workflow is configured for `us-central1`. If you want a different region, update both the `gcloud` command above and the `REGION` variable in `.github/workflows/deploy.yml`.

### 4. Set Up Workload Identity Federation

This allows GitHub Actions to authenticate to GCP without using service account keys.

```bash
# Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-actions-pool" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Get the pool ID
export WORKLOAD_IDENTITY_POOL_ID=$(gcloud iam workload-identity-pools describe "github-actions-pool" \
  --location="global" \
  --format="value(name)")

# Create Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner=='YOUR_GITHUB_USERNAME'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

**Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username or organization name.**

### 5. Create Service Account for Deployment

```bash
# Create service account
gcloud iam service-accounts create github-actions-sa \
  --display-name="GitHub Actions Service Account"

export SERVICE_ACCOUNT_EMAIL="github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant necessary permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

# Allow GitHub Actions to impersonate this service account
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/YOUR_GITHUB_USERNAME/crm"
```

**Replace `YOUR_GITHUB_USERNAME/crm` with your actual GitHub repository path (e.g., `octocat/my-repo`).**

### 6. Create Secrets in Secret Manager

```bash
# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Create DATABASE_URL secret
echo -n "postgresql://user:password@host:5432/dbname" | \
  gcloud secrets create DATABASE_URL \
    --data-file=- \
    --replication-policy="automatic"

# Create INNGEST_EVENT_KEY secret (for gmail service)
echo -n "your-inngest-event-key" | \
  gcloud secrets create INNGEST_EVENT_KEY \
    --data-file=- \
    --replication-policy="automatic"

# Create INNGEST_SIGNING_KEY secret (for gmail service)
echo -n "your-inngest-signing-key" | \
  gcloud secrets create INNGEST_SIGNING_KEY \
    --data-file=- \
    --replication-policy="automatic"

# Grant Cloud Run service access to secrets
for secret in DATABASE_URL INNGEST_EVENT_KEY INNGEST_SIGNING_KEY; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"
done
```

**Update the secret values with your actual credentials.**

### 7. Get Workload Identity Provider Path

```bash
gcloud iam workload-identity-pools providers describe "github-provider" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --format="value(name)"
```

This will output something like:
```
projects/123456789/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider
```

## GitHub Repository Setup

### 1. Add GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

| Secret Name | Value | Example |
|------------|-------|---------|
| `GCP_PROJECT_ID` | Your GCP project ID | `my-crm-project` |
| `WIF_PROVIDER` | Full path from step 7 above | `projects/123.../providers/github-provider` |
| `WIF_SERVICE_ACCOUNT` | Service account email | `github-actions-sa@PROJECT_ID.iam.gserviceaccount.com` |

**Note:** The deployment region is hardcoded to `us-central1` in the workflow. To change it, edit `.github/workflows/deploy.yml`.

### 2. Push to Main Branch

The deployment workflow will automatically trigger when you push changes to the `main` branch.

## Deployment Behavior

The workflow intelligently detects changes:

- **If packages/ directory changes**: All services (api, gmail, web) are deployed
- **If only apps/api/ changes**: Only crm-api is deployed
- **If only apps/gmail/ changes**: Only crm-gmail is deployed
- **If only apps/web/ changes**: Only crm-web is deployed

### Manual Deployment

You can also trigger deployments manually:

1. Go to GitHub → Actions → Deploy to Cloud Run
2. Click "Run workflow"
3. Choose services to deploy:
   - `all` - Deploy all services
   - `api` - Deploy only API
   - `gmail` - Deploy only Gmail service
   - `web` - Deploy only Web
   - `api,gmail` - Deploy API and Gmail
   - etc.

## Service Configuration

### Resource Limits

Current configuration per service:

| Service | Memory | CPU | Min Instances | Max Instances |
|---------|--------|-----|---------------|---------------|
| crm-api | 512Mi | 1 | 0 | 10 |
| crm-gmail | 512Mi | 1 | 0 | 10 |
| crm-web | 256Mi | 1 | 0 | 10 |

To modify, edit the `--memory`, `--cpu`, `--min-instances`, or `--max-instances` flags in `.github/workflows/deploy.yml`.

### Environment Variables & Secrets

Services are configured with:

**crm-api:**
- `NODE_ENV=production`
- `DATABASE_URL` (from Secret Manager)

**crm-gmail:**
- `NODE_ENV=production`
- `DATABASE_URL` (from Secret Manager)
- `INNGEST_EVENT_KEY` (from Secret Manager)
- `INNGEST_SIGNING_KEY` (from Secret Manager)

**crm-web:**
- `NODE_ENV=production`

To add more environment variables or secrets, modify the `--set-env-vars` or `--set-secrets` flags in the deploy steps.

## Accessing Services

After deployment, get service URLs:

```bash
# API
gcloud run services describe crm-api \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)'

# Gmail
gcloud run services describe crm-gmail \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)'

# Web
gcloud run services describe crm-web \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)'
```

## Custom Domain Setup (Optional)

To use custom domains:

```bash
# Map domain to service
gcloud run domain-mappings create \
  --service crm-web \
  --domain www.yourdomain.com \
  --region $REGION

# Follow DNS instructions shown in output
```

## Troubleshooting

### View Logs

```bash
# API logs
gcloud run services logs read crm-api --region $REGION --limit 50

# Gmail logs
gcloud run services logs read crm-gmail --region $REGION --limit 50

# Web logs
gcloud run services logs read crm-web --region $REGION --limit 50
```

### Check Service Status

```bash
gcloud run services describe crm-api --region $REGION
```

### Test Health Endpoints

```bash
# API health check
curl https://YOUR-API-URL/health

# Gmail health check
curl https://YOUR-GMAIL-URL/health
```

## Cost Management

Cloud Run charges based on:
- Request count
- CPU/Memory usage during request processing
- Always-on instances (if min-instances > 0)

Current config uses min-instances=0 to minimize costs when idle.

To monitor costs:
```bash
gcloud billing accounts list
gcloud billing projects describe $PROJECT_ID
```

## Cleanup

To delete all resources:

```bash
# Delete Cloud Run services
gcloud run services delete crm-api --region $REGION --quiet
gcloud run services delete crm-gmail --region $REGION --quiet
gcloud run services delete crm-web --region $REGION --quiet

# Delete Artifact Registry repository
gcloud artifacts repositories delete crm --location $REGION --quiet

# Delete secrets
gcloud secrets delete DATABASE_URL --quiet
gcloud secrets delete INNGEST_EVENT_KEY --quiet
gcloud secrets delete INNGEST_SIGNING_KEY --quiet

# Delete service account
gcloud iam service-accounts delete $SERVICE_ACCOUNT_EMAIL --quiet

# Delete workload identity pool
gcloud iam workload-identity-pools delete github-actions-pool --location global --quiet
```
