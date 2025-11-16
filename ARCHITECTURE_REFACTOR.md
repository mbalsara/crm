# Gmail Service Architecture Refactor

## Summary of Changes

Based on your feedback, we've restructured the application to follow a cleaner separation of concerns:

1. **✅ Moved data operations to API service** - All integrations, emails, and tenants are now managed by the CRM API
2. **✅ Created Gmail Client Factory** - Abstracts credential strategy (OAuth vs Service Account)
3. **✅ Added webhook tenant identification** - Email→tenantId lookup via API

---

## New Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Gmail Pub/Sub                        │
│                  (Push Notifications)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  apps/gmail          │
          │  (Sync Worker)       │
          │                      │
          │  - Webhook Handler   │───────┐
          │  - Inngest Functions │       │
          │  - Gmail Client      │       │
          │  - Sync Logic        │       │
          └──────────┬───────────┘       │
                     │                   │
                     │ HTTP Calls        │ HTTP Calls
                     ▼                   ▼
          ┌──────────────────────────────────────┐
          │         apps/api                     │
          │         (Data Layer)                 │
          │                                      │
          │  Routes:                             │
          │    - /api/integrations  (OAuth/SA)   │
          │    - /api/tenants       (sync state) │
          │    - /api/emails        (bulk ops)   │
          │                                      │
          │  Repositories:                       │
          │    - IntegrationRepository           │
          │    - TenantRepository                │
          │    - EmailRepository                 │
          └──────────┬───────────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │    PostgreSQL        │
          │    (Database)        │
          └──────────────────────┘
```

---

## Key Changes

### 1. Data Layer Moved to API

**Before:**
```typescript
// Gmail service directly accessed database
import { IntegrationRepository } from '@crm/integrations';
const repo = container.resolve(IntegrationRepository);
const credentials = await repo.getCredentials(tenantId, 'gmail');
```

**After:**
```typescript
// Gmail service calls API
import { ApiClient } from '../utils/api-client';
const apiClient = container.resolve(ApiClient);
const credentials = await apiClient.getIntegrationCredentials(tenantId, 'gmail');
```

**Benefit:** API becomes the single source of truth. Gmail can be updated without worrying about breaking other services.

---

### 2. Gmail Client Factory

**Before:**
```typescript
// Gmail auth service handled credential logic
const authService = container.resolve(GmailAuthService);
const accessToken = await authService.getValidAccessToken(tenantId);

// Manually create Gmail client
const auth = new google.auth.OAuth2();
auth.setCredentials({ access_token: accessToken });
const gmail = google.gmail({ version: 'v1', auth });
```

**After:**
```typescript
// Simple, credential-strategy agnostic
const clientFactory = container.resolve(GmailClientFactory);
const gmail = await clientFactory.getClient(tenantId);

// That's it! Factory handles OAuth vs Service Account automatically
```

**Benefit:** Gmail services don't need to know HOW to authenticate, just WHAT to do with the client.

---

### 3. Webhook Tenant Identification

**Problem:** When Gmail sends a webhook, we receive an email address but need the tenantId.

**Solution:** Added email→tenantId lookup in IntegrationRepository:

```typescript
// In apps/api/src/repositories/integration.repository.ts

async findTenantByEmail(email: string, source: string = 'gmail'): Promise<string | null> {
  const result = await this.db
    .select({ tenantId: integrations.tenantId, keys: integrations.keys })
    .from(integrations)
    .where(and(eq(integrations.source, source), eq(integrations.isActive, true)));

  // Decrypt and search for matching email
  for (const row of result) {
    const keys = await encryption.decryptJSON<IntegrationKeys>(row.keys);

    if (
      keys.impersonatedUserEmail === email ||
      keys.email === email
    ) {
      return row.tenantId;
    }
  }

  return null;
}
```

**API Endpoint:**
```bash
GET /api/integrations/lookup/by-email?email=support@company.com&source=gmail
```

**Response:**
```json
{
  "tenantId": "tenant-123",
  "email": "support@company.com",
  "source": "gmail"
}
```

---

## Updated Integration Keys

Now includes `email` field for tenant lookup:

```typescript
export interface IntegrationKeys {
  // Email being monitored/synced (for tenant lookup)
  email?: string;

  // OAuth credentials
  accessToken?: string;
  refreshToken?: string;

  // Service Account credentials
  serviceAccountEmail?: string;
  serviceAccountKey?: any;
  impersonatedUserEmail?: string;

  // ...
}
```

**When creating integration, MUST include email:**

```bash
# OAuth Integration
POST /api/integrations
{
  "tenantId": "tenant-123",
  "authType": "oauth",
  "keys": {
    "email": "user@company.com",      # ← Required for lookup
    "accessToken": "...",
    "refreshToken": "..."
  }
}

# Service Account Integration
POST /api/integrations
{
  "tenantId": "tenant-123",
  "authType": "service_account",
  "keys": {
    "email": "support@company.com",              # ← Or use this
    "impersonatedUserEmail": "support@company.com",  # ← Or this
    "serviceAccountEmail": "...",
    "serviceAccountKey": { ... }
  }
}
```

---

## New API Endpoints

### Integrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/integrations` | Create/update integration |
| GET | `/api/integrations/:tenantId/:source` | Get integration metadata |
| GET | `/api/integrations/:tenantId/:source/credentials` | Get decrypted credentials (internal) |
| PATCH | `/api/integrations/:tenantId/:source/keys` | Update keys (partial) |
| PUT | `/api/integrations/:tenantId/:source/token-expiration` | Update OAuth expiration |
| GET | `/api/integrations/lookup/by-email?email=...` | Find tenant by email |
| GET | `/api/integrations/:tenantId` | List all integrations for tenant |
| DELETE | `/api/integrations/:tenantId/:source` | Deactivate integration |

### Tenants

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tenants` | Create tenant |
| GET | `/api/tenants/:tenantId` | Get tenant |
| PATCH | `/api/tenants/:tenantId/sync-state` | Update sync state |

### Emails

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/emails/bulk` | Bulk insert emails |
| GET | `/api/emails?tenantId=...` | List emails |
| GET | `/api/emails/thread/:threadId?tenantId=...` | Get emails by thread |
| GET | `/api/emails/exists?tenantId=...&gmailMessageId=...` | Check if email exists |

---

## Updated Gmail Service Components

### 1. Gmail Client Factory (`gmail-client.factory.ts`)

```typescript
@injectable()
export class GmailClientFactory {
  async getClient(tenantId: string): Promise<gmail_v1.Gmail> {
    // Fetches credentials from API
    // Determines OAuth vs Service Account
    // Returns ready-to-use Gmail client
  }
}
```

### 2. API Client (`utils/api-client.ts`)

```typescript
@injectable()
export class ApiClient {
  async getIntegrationCredentials(tenantId, source)
  async updateIntegrationKeys(tenantId, source, keys)
  async findTenantByEmail(email, source)
  async getTenant(tenantId)
  async updateTenantSyncState(tenantId, state)
  async bulkInsertEmails(emails)
}
```

### 3. Updated Webhook Handler

**Before:**
```typescript
// Hardcoded tenant lookup
const tenantId = c.req.query('tenantId') || 'default-tenant-id';
```

**After:**
```typescript
// Dynamic lookup via API
const { emailAddress } = decodePubSubMessage(message.data);
const tenantId = await apiClient.findTenantByEmail(emailAddress, 'gmail');

if (!tenantId) {
  return c.json({ error: 'No tenant found for email' }, 404);
}
```

---

## Usage Examples

### 1. Setting Up Integration

```bash
# Step 1: Create tenant
POST /api/tenants
{
  "name": "Acme Corp"
}
# Response: { "tenant": { "id": "tenant-123", ... } }

# Step 2: Create Gmail integration
POST /api/integrations
{
  "tenantId": "tenant-123",
  "authType": "oauth",
  "keys": {
    "email": "support@acme.com",
    "accessToken": "ya29.xxx",
    "refreshToken": "1//xxx",
    "expiresAt": "2024-12-31T23:59:59Z"
  }
}
```

### 2. Webhook Flow

```
1. Gmail: New email arrives at support@acme.com
2. Gmail → Pub/Sub: {"emailAddress": "support@acme.com", "historyId": "12345"}
3. Pub/Sub → POST /webhooks/pubsub
4. Webhook → GET /api/integrations/lookup/by-email?email=support@acme.com
5. API → Returns: {"tenantId": "tenant-123"}
6. Webhook → Inngest event: gmail/webhook.received {tenantId: "tenant-123"}
7. Inngest → Sync function runs for tenant-123
```

### 3. Using Gmail Client Factory

```typescript
// In any Gmail service
class GmailService {
  constructor(private clientFactory: GmailClientFactory) {}

  async fetchMessages(tenantId: string) {
    // Get client - factory handles all auth complexity
    const gmail = await this.clientFactory.getClient(tenantId);

    // Use client - same code for OAuth or Service Account!
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 100
    });

    return response.data.messages || [];
  }
}
```

---

## Migration Guide

### For Existing Gmail Services

**Replace:**
```typescript
// Old: Direct repository access
constructor(private integrationRepo: IntegrationRepository) {}
const creds = await this.integrationRepo.getCredentials(tenantId, 'gmail');
```

**With:**
```typescript
// New: API client
constructor(private apiClient: ApiClient) {}
const creds = await this.apiClient.getIntegrationCredentials(tenantId, 'gmail');
```

### For Gmail Client Creation

**Replace:**
```typescript
// Old: Manual client creation
const authService = container.resolve(GmailAuthService);
const token = await authService.getValidAccessToken(tenantId);
const auth = new google.auth.OAuth2();
auth.setCredentials({ access_token: token });
const gmail = google.gmail({ version: 'v1', auth });
```

**With:**
```typescript
// New: Factory
const clientFactory = container.resolve(GmailClientFactory);
const gmail = await clientFactory.getClient(tenantId);
```

---

## Environment Variables

### API Service (`apps/api/.env`)
```bash
PORT=4000
DATABASE_URL=postgresql://localhost:5432/crm
GOOGLE_CLOUD_PROJECT_ID=your-project
LOG_LEVEL=info
```

### Gmail Service (`apps/gmail/.env`)
```bash
PORT=4001
API_BASE_URL=http://localhost:4000  # ← Points to API service
GOOGLE_CLIENT_ID=...                # For OAuth refresh
GOOGLE_CLIENT_SECRET=...
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
```

---

## Benefits of This Architecture

1. **🔒 Single Data Source** - API is the only service that writes to database
2. **🔄 Easy Updates** - Change API contracts without touching Gmail service
3. **🧪 Better Testing** - Mock API client instead of database repositories
4. **🚀 Scalability** - API and Gmail services scale independently
5. **🎯 Clear Boundaries** - Gmail = sync worker, API = data layer
6. **🔌 Extensibility** - Future integrations (Outlook, Slack) follow same pattern

---

## Next Steps

1. **Update Gmail Service DI Container** to register `ApiClient` and `GmailClientFactory`
2. **Update Sync Service** to use `ApiClient` instead of repositories
3. **Update Webhook Handler** to call API for tenant lookup
4. **Add API Authentication** (optional but recommended)
5. **Deploy Both Services** to Cloud Run
6. **Test End-to-End Flow**

---

## Files Modified/Created

### API Service (`apps/api`)
- ✅ `src/repositories/integration.repository.ts` - Added `findTenantByEmail()`
- ✅ `src/repositories/email.repository.ts` - Moved from gmail
- ✅ `src/repositories/tenant.repository.ts` - Moved from gmail
- ✅ `src/routes/integrations.ts` - New comprehensive API
- ✅ `src/routes/emails.ts` - Email operations API
- ✅ `src/routes/tenants.ts` - Tenant operations API
- ✅ `src/utils/logger.ts` - Pino logger
- ✅ `src/di/container.ts` - Register new repositories
- ✅ `src/index.ts` - Mount new routes
- ✅ `package.json` - Add `@crm/integrations` dependency

### Gmail Service (`apps/gmail`)
- ✅ `src/services/gmail-client.factory.ts` - New factory abstraction
- ✅ `src/utils/api-client.ts` - HTTP client for API calls
- ⏳ `src/di/container.ts` - TODO: Register ApiClient and GmailClientFactory
- ⏳ `src/services/sync.service.ts` - TODO: Update to use ApiClient
- ⏳ `src/routes/webhooks.ts` - TODO: Update to use API for tenant lookup

---

## Questions Answered

### Q1: How to identify tenant from webhook?
**A:** Integration keys now include `email` field. API endpoint `/api/integrations/lookup/by-email` searches all active integrations and returns matching tenantId.

### Q2: How to get Gmail client regardless of credential type?
**A:** `GmailClientFactory.getClient(tenantId)` handles everything. You don't need to know if it's OAuth or Service Account.

### Q3: Why move to API?
**A:** Allows Gmail and future integrations to be updated independently. API becomes the stable interface for all data operations.
