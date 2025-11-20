# Access Token Caching Design

## Problem

Currently, access tokens are cached in memory (`tokenCache` Map), which means:
- ❌ Tokens are lost on service restart
- ❌ Every service instance has its own cache (not shared)
- ❌ Tokens are regenerated unnecessarily on each restart
- ❌ Inefficient for multi-instance deployments

## Solution: Store Access Token in Database

Store access token alongside refresh token in the `integrations.token` field as JSON.

### Token Storage Format

```typescript
// New format (JSON stored in integrations.token field)
{
  refreshToken: string,      // Long-lived refresh token (required)
  accessToken?: string,      // Short-lived access token (cached, optional)
  expiresAt?: string,        // ISO timestamp when access token expires
  tokenType?: "Bearer"       // Token type (usually "Bearer")
}

// Old format (backward compatible)
"refresh_token_string"  // Just the refresh token as a string
```

### Benefits

1. **Persistent**: Survives service restarts
2. **Shared**: All service instances can use the same token
3. **Efficient**: Only refresh when expired (with 5min buffer)
4. **Backward Compatible**: Handles old format (just refreshToken string)

## Implementation Strategy

### 1. Token Storage Structure

**Current**: `integrations.token` = `"refresh_token_string"`  
**New**: `integrations.token` = `{"refreshToken": "...", "accessToken": "...", "expiresAt": "...", "tokenType": "Bearer"}`

### 2. Token Parsing Logic

```typescript
interface TokenData {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: string;
  tokenType?: string;
}

function parseToken(token: string | null): TokenData {
  if (!token) {
    throw new Error('No token found');
  }
  
  // Try to parse as JSON (new format)
  try {
    const parsed = JSON.parse(token);
    if (parsed.refreshToken) {
      return parsed; // New format
    }
  } catch {
    // Not JSON, continue
  }
  
  // Old format: just refresh token string
  return {
    refreshToken: token,
  };
}
```

### 3. Token Refresh Logic

```typescript
async getAccessToken(tenantId: string): Promise<string> {
  const integration = await getIntegration(tenantId);
  const tokenData = parseToken(integration.token);
  
  // Check if access token exists and is still valid (with 5min buffer)
  if (tokenData.accessToken && tokenData.expiresAt) {
    const expiresAt = new Date(tokenData.expiresAt);
    const now = new Date();
    const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
    
    if (expiresAt.getTime() - now.getTime() > bufferMs) {
      logger.info({ tenantId }, 'Using cached access token from database');
      return tokenData.accessToken; // Use cached token
    }
  }
  
  // Refresh token
  logger.info({ tenantId }, 'Access token expired or missing, refreshing');
  const newTokenData = await refreshAccessToken(tokenData.refreshToken);
  
  // Save updated token data back to database
  await updateIntegrationToken(tenantId, newTokenData);
  
  return newTokenData.accessToken;
}
```

### 4. Migration Strategy

- **Read**: Handle both old (string) and new (JSON) formats
- **Write**: Always write new format after refresh
- **Migration**: Gradually migrate as tokens are refreshed (no bulk migration needed)

## Implementation Steps

1. **Update IntegrationRepository**
   - Add `parseToken()` helper
   - Update `getCredentials()` to parse token and return accessToken if available
   - Update `updateRefreshToken()` to `updateToken()` that accepts full token data

2. **Update GmailClientFactory**
   - Check database for cached access token before refreshing
   - Update database after refreshing (not just in-memory cache)
   - Keep in-memory cache as secondary cache for performance

3. **Update IntegrationService**
   - Add method to update full token data
   - Ensure backward compatibility

4. **Update IntegrationClient**
   - Add method to update token data (if needed)

## API Changes

### IntegrationRepository

```typescript
// New method
async updateToken(
  tenantId: string,
  source: IntegrationSource,
  tokenData: {
    refreshToken: string;
    accessToken?: string;
    expiresAt?: Date;
    tokenType?: string;
  }
): Promise<void>

// Updated method (rename from updateRefreshToken)
// Now accepts full token data object
```

### GmailClientFactory

```typescript
// Updated refreshOAuthToken to:
// 1. Check database for cached access token first
// 2. Only refresh if expired
// 3. Save new token data to database (not just memory)
```
