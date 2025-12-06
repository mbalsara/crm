# JWT Auto-Extension Implementation - Complete

## ✅ Implementation Complete

Auto-extension for JWT tokens has been fully implemented using the **refresh token pattern**.

## How It Works

### Token Types

1. **Access Token** (20 minutes)
   - Short-lived token for API calls
   - Automatically refreshed before expiration
   - Stored in memory (client-side)

2. **Refresh Token** (7 days)
   - Long-lived token for refreshing access tokens
   - Stored in database (hashed)
   - Can be revoked (logout, security breach)

### Auto-Extension Flow

```
1. User logs in → Get accessToken + refreshToken
2. Client stores both tokens
3. Before each API call:
   - Check if accessToken expires in < 2 minutes
   - If yes → Automatically refresh using refreshToken
4. If API call returns 401:
   - Try refreshing accessToken
   - Retry API call with new token
5. If refresh fails → User must login again
```

## What Was Implemented

### 1. Database Schema (`sql/refresh_tokens.sql`)

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hash
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
```

### 2. JWT Utilities (`apps/api/src/utils/jwt.ts`)

- `createAccessToken()` - Creates 20-minute access token
- `createRefreshToken()` - Creates 7-day refresh token
- `hashToken()` - Hashes refresh token for storage
- `verifyJWT()` - Verifies and decodes tokens

### 3. Auth Routes (`apps/api/src/auth/routes.ts`)

- `POST /api/auth/login` - Returns `accessToken` + `refreshToken`
- `POST /api/auth/refresh` - Refreshes access token
- `POST /api/auth/logout` - Revokes refresh token(s)
- `POST /api/auth/test-token` - Generates test tokens (dev only)

### 4. Base Client (`packages/clients/src/base-client.ts`)

- `setTokens()` - Set access and refresh tokens
- Auto-refresh before expiration (2-minute buffer)
- Auto-retry on 401 with refreshed token
- Works for web clients (with tokens) and service-to-service (without tokens)

## Usage

### Web Client (React/TypeScript)

```typescript
import { UserClient } from '@crm/clients';

const client = new UserClient('http://localhost:4000');

// Login and set tokens
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'user@example.com', password: 'password' }),
});
const { accessToken, refreshToken } = await loginResponse.json();

client.setTokens(accessToken, refreshToken);

// Now all API calls automatically refresh tokens
const user = await client.getById('user-id');
// Token refreshed automatically if needed!
```

### Postman Testing

1. **Login:**
   ```
   POST /api/auth/login
   Body: { "email": "user@example.com", "password": "password" }
   Response: { "accessToken": "...", "refreshToken": "..." }
   ```

2. **Use Access Token:**
   ```
   GET /api/users/:id
   Header: Authorization: Bearer <accessToken>
   ```

3. **Refresh Token (automatic):**
   - Client automatically refreshes before expiration
   - Or manually: `POST /api/auth/refresh` with `refreshToken`

4. **Logout:**
   ```
   POST /api/auth/logout
   Header: Authorization: Bearer <accessToken>
   Body: { "refreshToken": "..." }  // Optional - revokes all if omitted
   ```

## Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-secret-key-change-this
JWT_ISSUER=crm-api
JWT_EXPIRES_IN=20m              # Access token expiration (default: 20m)
REFRESH_TOKEN_EXPIRES_IN=7d     # Refresh token expiration (default: 7d)

# Development
ALLOW_TEST_TOKEN=true           # Enable test token endpoint
```

## Token Expiration Behavior

| Token Type | Expiration | Auto-Extension | Revocable |
|------------|------------|----------------|-----------|
| **Access Token** | 20 minutes | ✅ Yes (via refresh) | ❌ No (stateless) |
| **Refresh Token** | 7 days | ❌ No | ✅ Yes (database) |

## Security Features

1. **Short-lived access tokens** - Limits exposure if stolen
2. **Refresh token hashing** - Stored as SHA-256 hash in database
3. **Token revocation** - Can revoke refresh tokens (logout, security breach)
4. **Automatic cleanup** - Expired/revoked tokens can be cleaned up
5. **Token rotation** - Can rotate refresh tokens on each use (optional)

## Next Steps

1. ✅ **Run database migration:**
   ```bash
   psql $DATABASE_URL -f sql/refresh_tokens.sql
   ```

2. ✅ **Set environment variables:**
   ```bash
   JWT_SECRET=your-secret-key
   JWT_EXPIRES_IN=20m
   REFRESH_TOKEN_EXPIRES_IN=7d
   ```

3. ✅ **Test in Postman:**
   - Login → Get tokens
   - Use access token in requests
   - Wait 20 minutes → Token auto-refreshes

4. ✅ **Update frontend:**
   - Store tokens after login
   - Call `client.setTokens(accessToken, refreshToken)`
   - All API calls will auto-refresh

## Summary

✅ **Auto-extension is fully implemented!**

- Tokens automatically refresh before expiration
- No user interruption (seamless experience)
- Secure (short-lived access tokens, revocable refresh tokens)
- Works with existing client code (just call `setTokens()`)

The system now supports automatic token extension without requiring users to login again every 20 minutes.
