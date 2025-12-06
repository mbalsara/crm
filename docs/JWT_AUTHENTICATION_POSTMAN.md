# JWT Authentication - Postman Testing Guide

## Overview

This guide explains how to use JWT token-based authentication in the CRM API and how to test it with Postman.

## Authentication Flow

```
1. Generate/Get JWT Token
   ↓
2. Include token in Authorization header
   ↓
3. API validates token and extracts userId/tenantId
   ↓
4. Request proceeds with authenticated context
```

## Endpoints

### 1. Generate Test Token (Development)

**Endpoint:** `POST /api/auth/test-token`

**Purpose:** Generate a JWT token for testing without requiring login.

**Request Body:**
```json
{
  "userId": "00000000-0000-0000-0000-000000000000",
  "tenantId": "00000000-0000-0000-0000-000000000000",
  "email": "test@example.com"
}
```

All fields are optional. If omitted, uses defaults from environment variables.

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "payload": {
      "userId": "00000000-0000-0000-0000-000000000000",
      "tenantId": "00000000-0000-0000-0000-000000000000",
      "email": "test@example.com"
    }
  }
}
```

**Note:** Only available if `ALLOW_TEST_TOKEN=true` or in development mode.

---

### 2. Login (Production)

**Endpoint:** `POST /api/auth/login`

**Purpose:** Authenticate user and get JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "tenantId": "00000000-0000-0000-0000-000000000000"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "tenantId": "tenant-uuid"
    }
  }
}
```

---

### 3. Get Current User

**Endpoint:** `GET /api/auth/me`

**Purpose:** Get current authenticated user info.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "tenantId": "tenant-uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "user@example.com",
    "rowStatus": 0,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

---

## Postman Setup

### Step 1: Generate Test Token

1. **Create a new request:**
   - Method: `POST`
   - URL: `http://localhost:4000/api/auth/test-token`

2. **Set Headers:**
   - `Content-Type: application/json`

3. **Set Body (raw JSON):**
   ```json
   {
     "userId": "00000000-0000-0000-0000-000000000000",
     "tenantId": "00000000-0000-0000-0000-000000000000"
   }
   ```

4. **Send request** and copy the `token` from response.

### Step 2: Use Token in Other Requests

#### Option A: Manual Header (Per Request)

1. **Create/Edit any API request**
2. **Go to Headers tab**
3. **Add header:**
   - Key: `Authorization`
   - Value: `Bearer <paste-token-here>`

#### Option B: Environment Variable (Recommended)

1. **Create Postman Environment:**
   - Click "Environments" → "Create Environment"
   - Name: `CRM Local`

2. **Add Variables:**
   - `base_url`: `http://localhost:4000`
   - `auth_token`: (leave empty for now)

3. **Set Authorization Header:**
   - In your requests, go to "Authorization" tab
   - Type: `Bearer Token`
   - Token: `{{auth_token}}`

4. **After generating token:**
   - Copy token from response
   - Set `auth_token` environment variable
   - All requests will automatically use it

#### Option C: Pre-request Script (Auto Token Generation)

1. **Create a Pre-request Script** in your collection or request:
   ```javascript
   // Generate token if not set or expired
   if (!pm.environment.get("auth_token")) {
     pm.sendRequest({
       url: pm.environment.get("base_url") + "/api/auth/test-token",
       method: 'POST',
       header: {
         'Content-Type': 'application/json'
       },
       body: {
         mode: 'raw',
         raw: JSON.stringify({
           userId: pm.environment.get("dev_user_id") || "00000000-0000-0000-0000-000000000000",
           tenantId: pm.environment.get("dev_tenant_id") || "00000000-0000-0000-0000-000000000000"
         })
       }
     }, function (err, res) {
       if (res.json().success) {
         pm.environment.set("auth_token", res.json().data.token);
       }
     });
   }
   ```

2. **Set Authorization header** to use `{{auth_token}}`

---

## Example Postman Collection

### Collection Structure:

```
CRM API
├── Auth
│   ├── Generate Test Token (POST /api/auth/test-token)
│   ├── Login (POST /api/auth/login)
│   └── Get Current User (GET /api/auth/me)
├── Users
│   ├── Get User (GET /api/users/:id)
│   ├── Search Users (POST /api/users/find)
│   └── Create User (POST /api/users)
└── Companies
    ├── Get Company (GET /api/companies/:id)
    └── Search Companies (POST /api/companies/search)
```

### Collection Variables:

```json
{
  "base_url": "http://localhost:4000",
  "auth_token": "",
  "dev_user_id": "00000000-0000-0000-0000-000000000000",
  "dev_tenant_id": "00000000-0000-0000-0000-000000000000"
}
```

---

## Testing Workflow

### 1. Quick Test (Development Mode)

If `ALLOW_DEV_AUTH=true` or in development, you can skip authentication:

- **No Authorization header needed**
- Uses hardcoded `userId` and `tenantId`
- Good for quick testing

### 2. Full Authentication Flow

1. **Generate token:**
   ```
   POST /api/auth/test-token
   ```

2. **Use token in requests:**
   ```
   Authorization: Bearer <token>
   ```

3. **Test authenticated endpoints:**
   ```
   GET /api/users/:id
   POST /api/users/find
   GET /api/auth/me
   ```

### 3. Token Expiration

- Tokens expire after 24 hours (default)
- When token expires, you'll get `401 Unauthorized`
- Generate a new token using `/api/auth/test-token` or `/api/auth/login`

---

## Environment Variables

### Required for Production:

```bash
JWT_SECRET=your-secret-key-change-this
JWT_ISSUER=crm-api
JWT_EXPIRES_IN=24h
```

### Optional for Development:

```bash
# Allow test token generation
ALLOW_TEST_TOKEN=true

# Allow requests without Authorization header
ALLOW_DEV_AUTH=true

# Default user/tenant for dev mode
DEV_USER_ID=00000000-0000-0000-0000-000000000000
DEV_TENANT_ID=00000000-0000-0000-0000-000000000000
```

---

## Troubleshooting

### Error: "Missing or invalid Authorization header"

**Cause:** No Authorization header provided and dev mode disabled.

**Solution:**
- Add `Authorization: Bearer <token>` header
- Or set `ALLOW_DEV_AUTH=true` in environment

### Error: "Token has expired"

**Cause:** Token expired (default: 24 hours).

**Solution:**
- Generate new token using `/api/auth/test-token`
- Or set longer expiration: `JWT_EXPIRES_IN=7d`

### Error: "Invalid token"

**Cause:** Token signature invalid or malformed.

**Solution:**
- Generate new token
- Check `JWT_SECRET` matches between token creation and verification

### Error: "Test token generation is disabled"

**Cause:** `ALLOW_TEST_TOKEN` not set and in production mode.

**Solution:**
- Set `ALLOW_TEST_TOKEN=true` in environment
- Or use `/api/auth/login` endpoint instead

---

## Security Notes

1. **Never commit JWT_SECRET** to version control
2. **Use HTTPS** in production
3. **Set reasonable expiration** (24h default)
4. **Rotate JWT_SECRET** periodically
5. **Disable test token endpoint** in production (`ALLOW_TEST_TOKEN=false`)

---

## Example cURL Commands

### Generate Test Token:
```bash
curl -X POST http://localhost:4000/api/auth/test-token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "00000000-0000-0000-0000-000000000000",
    "tenantId": "00000000-0000-0000-0000-000000000000"
  }'
```

### Use Token in Request:
```bash
TOKEN="<paste-token-here>"

curl -X GET http://localhost:4000/api/users/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer $TOKEN"
```

### Get Current User:
```bash
curl -X GET http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```
