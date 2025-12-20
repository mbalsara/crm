# Internal API Key Authentication

## Overview

Service-to-service authentication uses API keys with SHA-256 hashing for secure authentication between internal services (crm-gmail, crm-analysis) and the crm-api.

## Rationale for Hashing

**Why hash the API key instead of storing it directly?**

1. **Security Best Practice**: Never store secrets in plaintext. If the database is compromised, attackers only see hashes, not usable keys.

2. **Same as Password Storage**: This follows the same principle as password hashing - the original secret is never stored.

3. **One-Way Function**: SHA-256 is irreversible. Even with database access, the original key cannot be recovered.

4. **Defense in Depth**: Even if an attacker gains database read access, they cannot impersonate internal services.

## Architecture

```
┌─────────────────────┐                    ┌─────────────────────┐
│  crm-gmail          │                    │  crm-analysis       │
│  crm-analysis       │                    │                     │
│                     │                    │                     │
│  INTERNAL_API_KEY   │                    │  INTERNAL_API_KEY   │
│  = "original-secret"│                    │  = "original-secret"│
└──────────┬──────────┘                    └──────────┬──────────┘
           │                                          │
           │  X-Internal-Api-Key: "original-secret"   │
           └────────────────┬─────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │       crm-api           │
              │                         │
              │  1. Receive API key     │
              │  2. Hash with SHA-256   │
              │  3. Query database      │
              └────────────┬────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │       Database          │
              │                         │
              │  users.api_key_hash     │
              │  = "hashed-value"       │
              └─────────────────────────┘
```

## Authentication Flow

1. **Service sends request** with header:
   ```
   X-Internal-Api-Key: original-secret-key
   ```

2. **API receives key** and computes SHA-256 hash:
   ```typescript
   const hash = crypto.createHash('sha256')
     .update(apiKey)
     .digest('hex');
   ```

3. **API queries database**:
   ```sql
   SELECT * FROM users WHERE api_key_hash = 'computed-hash'
   ```

4. **If match found**: Request is authenticated with that user's tenant and permissions

5. **If no match**: Returns 401 Unauthorized

## Setup Instructions

### Step 1: Generate a New Secret Key

```bash
# Generate a random 32-byte hex string (64 characters)
openssl rand -hex 32
```

Example output:
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

### Step 2: Compute the SHA-256 Hash

```bash
# Hash the secret (use -n to avoid trailing newline)
echo -n "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456" | shasum -a 256
```

Example output:
```
7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069  -
```

The hash is: `7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069`

### Step 3: Store Hash in Database

```sql
-- Update the internal service user with the hash
UPDATE users
SET api_key_hash = '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069'
WHERE email = 'internal-service@system';
```

### Step 4: Set Environment Variable in Cloud Run

Set `INTERNAL_API_KEY` to the **original secret** (NOT the hash):

```bash
# For crm-gmail
gcloud run services update crm-gmail \
  --update-env-vars INTERNAL_API_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456 \
  --region=us-central1

# For crm-analysis
gcloud run services update crm-analysis \
  --update-env-vars INTERNAL_API_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456 \
  --region=us-central1
```

### Step 5: Verify

Check the logs for successful authentication:
```
"msg": "Internal API call authenticated"
```

## Common Mistakes

### Mistake 1: Storing the Key Instead of Hash in Database

**Wrong:**
```sql
api_key_hash = 'original-secret-key'  -- This is the key, not hash!
```

**Correct:**
```sql
api_key_hash = 'sha256-hash-of-key'
```

### Mistake 2: Setting Hash as Environment Variable

**Wrong:**
```
INTERNAL_API_KEY=7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
```
This causes double-hashing: `SHA256(SHA256(original))` won't match `SHA256(original)`

**Correct:**
```
INTERNAL_API_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

## Troubleshooting

### API Key Not Matching

1. **Check logs for hash prefix:**
   ```
   "hashPrefix": "0758def98556"
   ```

2. **Compare with database:**
   ```sql
   SELECT LEFT(api_key_hash, 12) FROM users WHERE api_key_hash IS NOT NULL;
   ```

3. **If they don't match:** Either the env var or database value is wrong

### Regenerating Keys

If you need to rotate the API key:

1. Generate new secret
2. Compute new hash
3. Update database with new hash
4. Update Cloud Run env vars with new secret
5. Redeploy services

## Security Considerations

1. **Never log the actual API key** - only log hash prefixes for debugging
2. **Rotate keys periodically** - especially if there's any suspicion of compromise
3. **Use different keys per environment** - dev, staging, production should have separate keys
4. **Limit permissions** - the internal service user should have only necessary permissions

## Related Files

- `apps/api/src/middleware/requestHeader.ts` - API key validation logic
- `apps/api/src/users/repository.ts` - `findByApiKeyHash()` method
- `apps/api/src/users/schema.ts` - `api_key_hash` column definition
- `packages/clients/src/base-client.ts` - Sends `X-Internal-Api-Key` header
