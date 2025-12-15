# Cloud Run Environment Variables

This document lists all environment variables that should be configured in Google Cloud Run for the CRM API service.

## Required Environment Variables

### Database
- `DATABASE_URL` - PostgreSQL connection string
  - Example: `postgresql://user:password@host:5432/dbname?sslmode=require`

### Google OAuth (Better-Auth)
- `GOOGLE_CLIENT_ID` - Google OAuth Client ID
  - Get from: https://console.cloud.google.com/apis/credentials
- `GOOGLE_CLIENT_SECRET` - Google OAuth Client Secret
  - Get from: https://console.cloud.google.com/apis/credentials

### Service URLs
- `SERVICE_GMAIL_URL` - Gmail service URL
  - Example: `https://gmail-service-xxx.run.app`
- `SERVICE_ANALYSIS_URL` - Analysis service URL
  - Example: `https://analysis-service-xxx.run.app`

## Optional Environment Variables

### Better-Auth Configuration
- `BETTER_AUTH_SECRET` - Secret key for better-auth (minimum 32 characters)
  - If not set, falls back to `SESSION_SECRET`
  - **Recommended**: Set a strong random secret in production
- `BETTER_AUTH_URL` - Base URL for better-auth API
  - Default: `http://localhost:4001` (for local dev)
  - **Cloud Run**: Set to your Cloud Run API service URL
  - Example: `https://api-service-xxx.run.app`

### Frontend URL (Critical for OAuth Redirects)
- `WEB_URL` - Frontend web application URL
  - Default: `http://localhost:4000` (for local dev)
  - **Cloud Run**: Set to your frontend Cloud Run service URL or custom domain
  - Example: `https://web-service-xxx.run.app` or `https://yourdomain.com`
  - **Important**: This is used for OAuth callback redirects after Google sign-in

### Other
- `SESSION_SECRET` - Session secret (fallback if `BETTER_AUTH_SECRET` not set)
- `PORT` - Server port (default: 4001, Cloud Run sets this automatically)
- `NODE_ENV` - Environment (set to `production` in Cloud Run)

## Cloud Run Configuration

### Setting Environment Variables in Cloud Run

#### Using gcloud CLI:
```bash
gcloud run services update api-service \
  --set-env-vars="WEB_URL=https://your-frontend-url.com,BETTER_AUTH_URL=https://your-api-url.run.app,DATABASE_URL=postgresql://..."
```

#### Using Cloud Console:
1. Go to Cloud Run → Your Service → Edit & Deploy New Revision
2. Navigate to "Variables & Secrets" tab
3. Add environment variables:
   - `WEB_URL` = `https://your-frontend-url.com`
   - `BETTER_AUTH_URL` = `https://your-api-url.run.app`
   - `DATABASE_URL` = `postgresql://...`
   - etc.

#### Using Terraform/Infrastructure as Code:
```hcl
resource "google_cloud_run_service" "api" {
  # ... other config ...
  
  template {
    spec {
      containers {
        env {
          name  = "WEB_URL"
          value = "https://your-frontend-url.com"
        }
        env {
          name  = "BETTER_AUTH_URL"
          value = "https://your-api-url.run.app"
        }
        env {
          name  = "DATABASE_URL"
          value = var.database_url
        }
        # ... other env vars ...
      }
    }
  }
}
```

## Important Notes

1. **WEB_URL is Critical**: After Google OAuth sign-in, users are redirected to `WEB_URL`. If this is incorrect, users will be redirected to the wrong URL.

2. **BETTER_AUTH_URL**: Should match your Cloud Run API service URL. Used for OAuth callback URLs.

3. **Google OAuth Callback**: Make sure your Google OAuth credentials have the callback URL configured:
   - Development: `http://localhost:4001/api/auth/callback/google`
   - Production: `https://your-api-url.run.app/api/auth/callback/google`

4. **Secrets Management**: For sensitive values like `DATABASE_URL` and `GOOGLE_CLIENT_SECRET`, consider using Google Secret Manager instead of plain environment variables.

## Example Cloud Run Deployment

```bash
# Set all required environment variables
gcloud run deploy api-service \
  --source . \
  --region us-central1 \
  --set-env-vars="WEB_URL=https://web-service-xxx.run.app,BETTER_AUTH_URL=https://api-service-xxx.run.app,DATABASE_URL=postgresql://...,GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com,GOOGLE_CLIENT_SECRET=xxx,SERVICE_GMAIL_URL=https://gmail-service-xxx.run.app,SERVICE_ANALYSIS_URL=https://analysis-service-xxx.run.app" \
  --allow-unauthenticated
```

## Verification

After deployment, verify environment variables are set:
```bash
gcloud run services describe api-service --region us-central1 --format="value(spec.template.spec.containers[0].env)"
```
