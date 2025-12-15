# Better-Auth Environment Variables

## Required Variables

### Google OAuth
```bash
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

**Setup Instructions:** See [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md) for detailed steps on how to get these credentials from Google Cloud Console.

### Better-Auth Configuration
```bash
# Better-Auth secret key (minimum 32 characters)
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your-secret-key-minimum-32-characters-long

# Better-Auth base URL (API server)
BETTER_AUTH_URL=http://localhost:4001  # Dev: API runs on 4001

# Web app URL (for CORS)
WEB_URL=http://localhost:4000  # Dev: Web app runs on 4000
```

## Optional Variables

### Development Mode
```bash
# Allow dev auth fallback (only works in development mode)
ALLOW_DEV_AUTH=true  # Optional: Keep current dev auth working

# Dev tenant/user IDs (for dev auth fallback)
DEV_TENANT_ID=00000000-0000-0000-0000-000000000000
DEV_USER_ID=00000000-0000-0000-0000-000000000000
```

## Production Variables

```bash
# Production URLs
BETTER_AUTH_URL=https://api.yourdomain.com
WEB_URL=https://app.yourdomain.com

# Production: Disable dev auth
NODE_ENV=production
ALLOW_DEV_AUTH=  # Leave empty or unset
```

## Example .env.local

```bash
# Database
DATABASE_URL=postgresql://...

# Google OAuth (for better-auth)
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123...

# Better-Auth
BETTER_AUTH_SECRET=your-super-secret-key-minimum-32-characters-long-here
BETTER_AUTH_URL=http://localhost:4001
WEB_URL=http://localhost:4000

# Dev mode
ALLOW_DEV_AUTH=true
DEV_TENANT_ID=00000000-0000-0000-0000-000000000000
DEV_USER_ID=00000000-0000-0000-0000-000000000000
```

## Generating BETTER_AUTH_SECRET

```bash
# Generate a secure random secret
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
