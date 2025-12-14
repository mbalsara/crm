# Google Cloud Console Setup for Better-Auth

## Overview

Configure Google OAuth credentials and callback URLs for better-auth Google SSO.

---

## Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**

---

## Step 2: Configure OAuth Consent Screen

If not already configured:

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (for testing) or **Internal** (for Google Workspace)
3. Fill in:
   - **App name**: Your CRM App Name
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **SAVE AND CONTINUE**
5. Add scopes:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
6. Click **SAVE AND CONTINUE**
7. Add test users (if External) → **SAVE AND CONTINUE**
8. Review and **BACK TO DASHBOARD**

---

## Step 3: Create OAuth Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Choose **Application type**: **Web application**
4. Fill in:
   - **Name**: CRM API OAuth Client
   - **Authorized JavaScript origins**:
     ```
     http://localhost:4001          # Dev API
     https://your-api-domain.com     # Production API
     ```
   - **Authorized redirect URIs**:
     ```
     http://localhost:4001/api/auth/callback/google          # Dev
     https://your-api-domain.com/api/auth/callback/google    # Production
     ```
5. Click **CREATE**
6. Copy **Client ID** and **Client Secret**

---

## Step 4: Set Environment Variables

**File:** `apps/api/.env` or `.env.local`

```bash
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here

# Better-Auth
BETTER_AUTH_URL=http://localhost:4001                    # Dev
# BETTER_AUTH_URL=https://your-api-domain.com            # Production
BETTER_AUTH_SECRET=your-secret-key-min-32-characters-long
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4000        # Web app URL
```

---

## Step 5: Verify Callback URL

The callback URL must match exactly:

**Development:**
```
http://localhost:4001/api/auth/callback/google
```

**Production:**
```
https://your-api-domain.com/api/auth/callback/google
```

**Important:**
- Must match exactly (including protocol, domain, port, path)
- No trailing slashes
- Case-sensitive

---

## Step 6: Test OAuth Flow

1. Start API server: `cd apps/api && pnpm dev` (runs on port 4001)
2. Navigate to: `http://localhost:4001/api/auth/sign-in/google`
3. Should redirect to Google OAuth consent screen
4. After authorization, should redirect back to callback URL
5. Check browser console for errors
6. Check API logs for session creation

---

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Problem:** Callback URL doesn't match Google Console configuration.

**Solution:**
- Verify callback URL in Google Console matches exactly
- Check `BETTER_AUTH_URL` environment variable
- Ensure no trailing slashes
- Check protocol (http vs https)

### Error: "invalid_client"

**Problem:** Client ID or secret is incorrect.

**Solution:**
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`
- Ensure no extra spaces or quotes
- Regenerate credentials if needed

### Error: "access_denied"

**Problem:** User denied consent or app not verified.

**Solution:**
- Add user as test user in OAuth consent screen (if External)
- Verify scopes are correct
- Check OAuth consent screen status

---

## Production Checklist

- [ ] OAuth consent screen published (if External)
- [ ] Production callback URL added to Google Console
- [ ] Production `BETTER_AUTH_URL` set correctly
- [ ] HTTPS enabled for production API
- [ ] `BETTER_AUTH_SECRET` is strong (32+ characters)
- [ ] `BETTER_AUTH_TRUSTED_ORIGINS` includes production web app URL

---

## Summary

**Required Configuration:**
1. ✅ OAuth consent screen configured
2. ✅ OAuth client ID created
3. ✅ Callback URL added: `/api/auth/callback/google`
4. ✅ Environment variables set
5. ✅ Test OAuth flow

**Key URLs:**
- **Sign-in**: `GET /api/auth/sign-in/google`
- **Callback**: `GET /api/auth/callback/google`
- **Session**: `GET /api/auth/session`
- **Sign-out**: `POST /api/auth/sign-out`
