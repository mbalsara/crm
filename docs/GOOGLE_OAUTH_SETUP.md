# Google OAuth Setup Guide

This guide walks you through setting up Google OAuth credentials for better-auth.

## Prerequisites

- A Google account
- Access to [Google Cloud Console](https://console.cloud.google.com/)

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click **"New Project"**
4. Enter a project name (e.g., "CRM App")
5. Click **"Create"**
6. Wait for the project to be created, then select it

## Step 2: Enable Google+ API

1. In the Google Cloud Console, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google+ API"** or **"Google Identity"**
3. Click on **"Google+ API"** (or **"Google Identity Services API"**)
4. Click **"Enable"**

**Note:** For better-auth, you may also need:
- **Google Identity Services API** (for newer OAuth 2.0)
- **Google OAuth2 API**

Enable both to be safe.

## Step 3: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Choose **"External"** (unless you have a Google Workspace account)
3. Click **"Create"**
4. Fill in the required information:
   - **App name**: Your app name (e.g., "CRM App")
   - **User support email**: Your email
   - **Developer contact information**: Your email
5. Click **"Save and Continue"**
6. On **"Scopes"** page, click **"Add or Remove Scopes"**
   - Add: `openid`, `email`, `profile`
   - Or use: `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`
7. Click **"Update"** → **"Save and Continue"**
8. On **"Test users"** (if External):
   - Add your email address as a test user (for testing)
   - Click **"Save and Continue"**
9. Review and click **"Back to Dashboard"**

## Step 4: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. If prompted, configure the consent screen (you already did this)
4. Choose **"Web application"** as the application type
5. Fill in:
   - **Name**: "CRM App Web Client" (or any name)
   - **Authorized JavaScript origins**:
     - `http://localhost:4001` (for development)
     - `http://localhost:4000` (for web app, if needed)
     - Add your production URLs later
   - **Authorized redirect URIs**:
     - `http://localhost:4001/api/auth/callback/google` (for development)
     - Add your production callback URL later: `https://your-domain.com/api/auth/callback/google`
6. Click **"Create"**
7. **Copy the Client ID and Client Secret** (you'll need these!)

## Step 5: Add Credentials to Your App

Add the credentials to your `.env.local` file in `apps/api/`:

```bash
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

**Important:** 
- Never commit these credentials to git
- Add `.env.local` to `.gitignore` if not already there
- Use different credentials for development and production

## Step 6: Restart Your Server

After adding the credentials:

```bash
# Stop your server (Ctrl+C)
# Then restart
cd apps/api
pnpm dev
```

## Step 7: Test Google SSO

1. Open your browser and go to:
   ```
   http://localhost:4001/api/auth/sign-in/google
   ```
2. You should be redirected to Google's OAuth consent screen
3. Sign in with your Google account
4. You'll be redirected back to your app

## Troubleshooting

### Issue: "redirect_uri_mismatch" error

**Solution:** Make sure the redirect URI in Google Console exactly matches:
- Development: `http://localhost:4001/api/auth/callback/google`
- Production: `https://your-domain.com/api/auth/callback/google`

### Issue: "Access blocked: This app's request is invalid"

**Solution:** 
- Make sure you added yourself as a test user (if using External app type)
- Check that the OAuth consent screen is configured
- Verify the scopes are correct

### Issue: "Invalid client" error

**Solution:**
- Double-check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`
- Make sure there are no extra spaces or quotes
- Restart your server after adding credentials

### Issue: Still getting 404 on `/api/auth/sign-in/google`

**Solution:**
- Verify better-auth is initialized (check server logs for "better-auth: getAuth")
- Make sure credentials are set correctly
- Check that the Google provider is enabled in better-auth config

## Production Setup

For production:

1. **Update OAuth Consent Screen:**
   - Go to **"OAuth consent screen"**
   - Add your production domain
   - Submit for verification (if needed for public apps)

2. **Add Production URLs:**
   - In **"Credentials"** → Your OAuth client
   - Add production URLs to:
     - **Authorized JavaScript origins**: `https://your-domain.com`
     - **Authorized redirect URIs**: `https://your-domain.com/api/auth/callback/google`

3. **Use Environment Variables:**
   - Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your production environment
   - Never hardcode credentials in code

## Security Best Practices

1. ✅ Keep credentials secret (never commit to git)
2. ✅ Use different credentials for dev/staging/production
3. ✅ Restrict redirect URIs to your domains only
4. ✅ Regularly rotate credentials
5. ✅ Monitor OAuth usage in Google Cloud Console
6. ✅ Use HTTPS in production (required for OAuth)

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Better-Auth Google Provider Docs](https://www.better-auth.com/docs/providers/google)
- [Google Cloud Console](https://console.cloud.google.com/)
