# Label Management APIs Design

## Requirements

Add APIs in Gmail service to manage email labels:
- Add label(s) to email
- Remove label(s) from email
- Update labels on email (replace all labels)

## API Design

### Endpoints

```
POST   /api/gmail/labels/add      - Add labels to email
POST   /api/gmail/labels/remove   - Remove labels from email
POST   /api/gmail/labels/update   - Replace all labels on email
```

### Request Format

All endpoints accept:
```typescript
{
  tenantId: string,        // Required - identifies the tenant
  messageId: string,       // Required - Gmail message ID (provider messageId)
  labelIds: string[]       // Required - Array of Gmail label IDs
}
```

### Response Format

```typescript
{
  success: boolean,
  messageId: string,
  labelIds: string[],      // Updated label IDs after operation
  message?: string
}
```

## Implementation Details

### 1. Gmail Service Methods

Add to `GmailService`:
```typescript
async addLabels(
  tenantId: string,
  messageId: string,
  labelIds: string[]
): Promise<{ labelIds: string[] }>

async removeLabels(
  tenantId: string,
  messageId: string,
  labelIds: string[]
): Promise<{ labelIds: string[] }>

async modifyLabels(
  tenantId: string,
  messageId: string,
  addLabelIds?: string[],
  removeLabelIds?: string[]
): Promise<{ labelIds: string[] }>
```

### 2. Route Handlers

Create `apps/gmail/src/routes/labels.ts`:
- Validate request body (tenantId, messageId, labelIds)
- Call Gmail service methods
- Handle errors and return responses
- Log operations for audit

### 3. Authentication

- Use existing `GmailClientFactory` to get authenticated client
- Leverages cached access tokens (from token caching design)
- Requires `gmail.modify` scope (not just `gmail.readonly`)

### 4. Gmail API Methods

- `gmail.users.messages.modify()` - Add/remove labels
- Requires `https://www.googleapis.com/auth/gmail.modify` scope

### 5. Security Considerations

- Validate tenantId matches the integration
- Ensure messageId belongs to the tenant's Gmail account
- Rate limit label operations (Gmail API has quotas)
- Log all label operations for audit trail

## Error Handling

- Invalid messageId → 404 Not Found
- Invalid labelIds → 400 Bad Request
- Missing scope → 403 Forbidden (need to re-authorize)
- Rate limit → 429 Too Many Requests (with retry)

## Example Usage

```bash
# Add label "IMPORTANT" to email
POST /api/gmail/labels/add
{
  "tenantId": "019a8e88-7fcb-7235-b427-25b77fed0563",
  "messageId": "18c5f8a1a2b3c4d5",
  "labelIds": ["IMPORTANT"]
}

# Remove label "UNREAD" from email
POST /api/gmail/labels/remove
{
  "tenantId": "019a8e88-7fcb-7235-b427-25b77fed0563",
  "messageId": "18c5f8a1a2b3c4d5",
  "labelIds": ["UNREAD"]
}

# Replace all labels (set to only these labels)
POST /api/gmail/labels/update
{
  "tenantId": "019a8e88-7fcb-7235-b427-25b77fed0563",
  "messageId": "18c5f8a1a2b3c4d5",
  "labelIds": ["INBOX", "IMPORTANT"]
}
```
