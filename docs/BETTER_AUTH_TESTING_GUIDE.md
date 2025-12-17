# Better-Auth Testing Guide

## Prerequisites

1. **Database Migration**
   ```bash
   # Run the better-auth tables migration
   psql $DATABASE_URL -f sql/better_auth_tables.sql
   ```

2. **Environment Variables**
   Add to `apps/api/.env.local`:
   ```bash
   # Better-Auth (required)
   BETTER_AUTH_SECRET=your-secret-key-minimum-32-characters-long
   BETTER_AUTH_URL=http://localhost:4001
   WEB_URL=http://localhost:4000
   
   # Google OAuth (should already exist)
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   
   # Dev mode (optional)
   ALLOW_DEV_AUTH=true
   DEV_TENANT_ID=your-tenant-id
   DEV_USER_ID=your-user-id
   ```

3. **Generate BETTER_AUTH_SECRET**
   ```bash
   # Option 1: Using openssl
   openssl rand -base64 32
   
   # Option 2: Using Node.js
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

4. **Google Cloud Console Setup**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to **APIs & Services** → **Credentials**
   - Create OAuth 2.0 Client ID (Web application)
   - Add authorized redirect URI: `http://localhost:4001/api/auth/callback/google`
   - Copy Client ID and Client Secret

---

## Testing Steps

### Step 1: Verify Database Tables Created

```bash
# Connect to database
psql $DATABASE_URL

# Check tables exist
\dt better_auth*

# Should show:
# - better_auth_user
# - better_auth_session
# - better_auth_account
# - better_auth_verification

# Check better_auth_user structure
\d better_auth_user

# Should show tenant_id column
```

### Step 2: Start API Server

```bash
cd apps/api
pnpm dev
```

**Expected Output:**
```
[Drizzle] ========================================
[Drizzle] Initializing database...
[Drizzle] Logging enabled: true
[Drizzle] ========================================
✅ Drizzle SQL logging enabled

{"level":"INFO","msg":"CRM API service starting"}
{"level":"INFO","msg":"Server listening successfully"}
```

### Step 3: Test Better-Auth Endpoints

#### 3.1: Check Better-Auth Routes Are Registered

```bash
# Test health endpoint (should work)
curl http://localhost:4001/health

# Test better-auth session endpoint (should return null if no session)
curl http://localhost:4001/api/auth/session

# Expected: {"data":null,"message":"No session found"}
```

#### 3.2: Test Google SSO Initiation

**In Browser:**
```
http://localhost:4001/api/auth/sign-in/google
```

**Expected:**
- Redirects to Google OAuth consent screen
- After consent, redirects to: `http://localhost:4001/api/auth/callback/google?code=...`
- Then redirects to your app (configured in better-auth)

**Using curl:**
```bash
# Get redirect URL (follow redirects)
curl -L http://localhost:4001/api/auth/sign-in/google

# Or just get the redirect location
curl -I http://localhost:4001/api/auth/sign-in/google
```

### Step 4: Test User Creation Flow

#### 4.1: Prerequisites for Testing

**Before testing Google SSO, ensure:**
1. You have a company domain mapped in `customer_domains` table
2. The email domain matches the company domain

**Example:**
```sql
-- Check existing company domains
SELECT * FROM customer_domains;

-- If needed, create a test company and domain
INSERT INTO customers (tenant_id, name) 
VALUES ('your-tenant-id', 'Test Company')
RETURNING id;

INSERT INTO customer_domains (customer_id, tenant_id, domain)
VALUES ('company-id', 'tenant-id', 'yourdomain.com');
```

#### 4.2: Test Google SSO Flow

1. **Open browser:** `http://localhost:4001/api/auth/sign-in/google`
2. **Sign in with Google** (use email matching your company domain)
3. **Check logs** for:
   ```
   [Drizzle SQL] INSERT INTO better_auth_user ...
   [Drizzle SQL] INSERT INTO users ...
   [Drizzle SQL] UPDATE better_auth_user SET tenant_id ...
   ```

4. **Verify in Database:**
   ```sql
   -- Check better-auth user was created
   SELECT * FROM better_auth_user WHERE email = 'your-email@yourdomain.com';
   -- Should show tenant_id populated
   
   -- Check user was created in users table
   SELECT * FROM users WHERE email = 'your-email@yourdomain.com';
   
   -- Check session was created
   SELECT * FROM better_auth_session WHERE user_id = (
     SELECT id FROM better_auth_user WHERE email = 'your-email@yourdomain.com'
   );
   ```

### Step 5: Test Session Validation

#### 5.1: Get Session Cookie

After Google SSO, browser should have a cookie set. Check browser DevTools → Application → Cookies.

**Or get session via API:**
```bash
# Get session (with cookie from browser)
curl http://localhost:4001/api/auth/session \
  -H "Cookie: better-auth.session_token=your-session-token"

# Expected: {"data":{"user":{...},"session":{...}}}
```

#### 5.2: Test Protected Endpoint

```bash
# Test with session cookie
curl http://localhost:4001/api/users/find \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=your-session-token" \
  -d '{"queries":[],"limit":10,"offset":0}'

# Expected: Should return users list (not 401)
```

### Step 6: Test Error Cases

#### 6.1: Test Missing Domain Mapping

**Scenario:** User tries to SSO with email domain not in `customer_domains`

1. Use Google account with email like `test@unknown-domain.com`
2. Try SSO
3. **Expected:** Error message about domain not found
4. **Check logs:** Should see error logged

#### 6.2: Test Missing TenantId

**Scenario:** Better-auth user exists but has no tenantId

```sql
-- Manually remove tenantId (for testing)
UPDATE better_auth_user SET tenant_id = NULL WHERE email = 'test@example.com';
```

**Test:**
```bash
# Try to access protected endpoint
curl http://localhost:4001/api/users/find \
  -X POST \
  -H "Cookie: better-auth.session_token=session-token"

# Expected: 401 Unauthorized with generic error message
```

### Step 7: Test Dev Auth Fallback

**If `ALLOW_DEV_AUTH=true` and `NODE_ENV=development`:**

```bash
# Access protected endpoint without session
curl http://localhost:4001/api/users/find \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"queries":[],"limit":10,"offset":0}'

# Expected: Should work (uses dev tenant/user IDs)
```

### Step 8: Test Legacy Auth Routes

**Custom auth routes moved to `/api/auth/legacy`:**

```bash
# Test legacy login
curl http://localhost:4001/api/auth/legacy/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","tenantId":"your-tenant-id"}'

# Test legacy test-token
curl http://localhost:4001/api/auth/legacy/test-token \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-test-token-api-key" \
  -d '{"userId":"user-id","tenantId":"tenant-id"}'
```

---

## Testing Checklist

### Backend Tests

- [ ] Database migration runs successfully
- [ ] Better-auth tables created with correct structure
- [ ] `tenant_id` column exists in `better_auth_user`
- [ ] API server starts without errors
- [ ] Better-auth routes registered at `/api/auth/*`
- [ ] Legacy routes accessible at `/api/auth/legacy/*`
- [ ] Google SSO initiation redirects correctly
- [ ] Google OAuth callback works
- [ ] User created in `better_auth_user` table
- [ ] User created/linked in `users` table
- [ ] `tenantId` stored in `better_auth_user`
- [ ] Session created in `better_auth_session`
- [ ] Session validation works
- [ ] Protected endpoints work with session
- [ ] Error handling works (missing domain, missing tenantId)
- [ ] Dev auth fallback works (if enabled)

### Integration Tests

- [ ] Google OAuth flow completes successfully
- [ ] User can access protected endpoints after SSO
- [ ] Session persists across requests
- [ ] Session expires after 30 minutes
- [ ] Session refreshes automatically (sliding window)
- [ ] Multiple users can SSO (different tenants)
- [ ] Tenant isolation maintained

### Error Cases

- [ ] Missing domain mapping → Error message
- [ ] Missing tenantId → Generic error (no tenant enumeration)
- [ ] Invalid session → 401 Unauthorized
- [ ] Expired session → 401 Unauthorized

---

## Quick Test Script

Save as `scripts/test-better-auth.sh`:

```bash
#!/bin/bash

API_URL="http://localhost:4001"

echo "🧪 Testing Better-Auth Implementation"
echo "===================================="

# Test 1: Health check
echo ""
echo "1. Testing health endpoint..."
curl -s "$API_URL/health" | jq '.' || echo "❌ Health check failed"

# Test 2: Session endpoint (should return null)
echo ""
echo "2. Testing session endpoint (no session)..."
curl -s "$API_URL/api/auth/session" | jq '.' || echo "❌ Session endpoint failed"

# Test 3: Google SSO initiation (should redirect)
echo ""
echo "3. Testing Google SSO initiation..."
REDIRECT=$(curl -s -I "$API_URL/api/auth/sign-in/google" | grep -i location | cut -d' ' -f2 | tr -d '\r')
if [[ $REDIRECT == *"accounts.google.com"* ]]; then
  echo "✅ Google SSO redirects correctly: $REDIRECT"
else
  echo "❌ Google SSO redirect failed"
fi

# Test 4: Legacy routes
echo ""
echo "4. Testing legacy routes..."
curl -s "$API_URL/api/auth/legacy/login" -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","tenantId":"00000000-0000-0000-0000-000000000000"}' | jq '.' || echo "❌ Legacy login failed"

echo ""
echo "✅ Basic tests complete!"
echo ""
echo "Next steps:"
echo "1. Open browser: $API_URL/api/auth/sign-in/google"
echo "2. Sign in with Google"
echo "3. Check database for created users"
echo "4. Test protected endpoints with session cookie"
```

Make executable:
```bash
chmod +x scripts/test-better-auth.sh
./scripts/test-better-auth.sh
```

---

## Manual Testing Flow

### Complete End-to-End Test

1. **Setup:**
   ```bash
   # Ensure company domain exists
   psql $DATABASE_URL -c "SELECT * FROM customer_domains WHERE domain = 'yourdomain.com';"
   ```

2. **Start Server:**
   ```bash
   cd apps/api
   pnpm dev
   ```

3. **Open Browser:**
   ```
   http://localhost:4001/api/auth/sign-in/google
   ```

4. **Sign In:**
   - Use Google account with email matching your company domain
   - Complete OAuth flow
   - Should redirect back to your app

5. **Verify:**
   - Check browser cookies (should have `better-auth.session_token`)
   - Check database:
     ```sql
     SELECT * FROM better_auth_user WHERE email = 'your-email@yourdomain.com';
     SELECT * FROM users WHERE email = 'your-email@yourdomain.com';
     SELECT * FROM better_auth_session;
     ```

6. **Test API:**
   ```bash
   # Copy session token from browser cookie
   curl http://localhost:4001/api/users/find \
     -X POST \
     -H "Content-Type: application/json" \
     -H "Cookie: better-auth.session_token=YOUR_TOKEN_HERE" \
     -d '{"queries":[],"limit":10,"offset":0}'
   ```

---

## Troubleshooting

### Issue: "Database not initialized"

**Solution:** Make sure `setupContainer()` is called before importing better-auth routes.

### Issue: "No company domain found"

**Solution:** Add your email domain to `customer_domains` table:
```sql
INSERT INTO customer_domains (customer_id, tenant_id, domain)
VALUES ('company-id', 'tenant-id', 'yourdomain.com');
```

### Issue: Google OAuth redirect fails

**Solution:** 
1. Check Google Cloud Console → Authorized redirect URIs
2. Ensure `http://localhost:4001/api/auth/callback/google` is added
3. Check `BETTER_AUTH_URL` matches your API URL

### Issue: Session not persisting

**Solution:**
1. Check cookie settings (httpOnly, secure, sameSite)
2. Check CORS configuration
3. Verify `trustedOrigins` includes your web app URL

### Issue: Hooks not firing

**Solution:**
1. Verify hook API syntax against latest better-auth docs
2. Check logs for hook execution
3. May need to use callbacks instead of hooks

---

## Next Steps After Testing

1. ✅ Verify hooks API syntax (may need adjustment)
2. ✅ Test with multiple users/tenants
3. ✅ Test session expiration
4. ✅ Test error cases
5. ⏳ Implement frontend (login page, auth context)
6. ⏳ Test end-to-end flow (browser → Google → callback → app)
