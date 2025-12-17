# Frontend Search Query - Quick Summary

## How Frontend Passes Search Query

### Step 1: Frontend Constructs Query Object

```typescript
// Frontend code (React, Vue, etc.)
const searchQuery = {
  queries: [
    { field: "status", operator: "eq", value: "active" },
    { field: "name", operator: "like", value: "%tech%" }
  ],
  sortBy: "createdAt",
  sortOrder: "desc",
  limit: 20,
  offset: 0
};
```

### Step 2: Client Package Sends HTTP POST

```typescript
// Client package (packages/clients)
const client = new CompanyClient();
const results = await client.search(searchQuery);

// Under the hood, client does:
POST /api/customers/search
Headers: {
  Authorization: "Bearer <JWT_TOKEN>",
  Content-Type: "application/json"
}
Body: {
  "queries": [
    { "field": "status", "operator": "eq", "value": "active" },
    { "field": "name", "operator": "like", "value": "%tech%" }
  ],
  "sortBy": "createdAt",
  "sortOrder": "desc",
  "limit": 20,
  "offset": 0
}
```

### Step 3: API Processes and Returns

```json
{
  "success": true,
  "data": {
    "items": [/* array of customers */],
    "total": 150,
    "limit": 20,
    "offset": 0
  }
}
```

## Visual Flow

```
┌─────────────────────────────────┐
│  Frontend (React/Vue/etc)      │
│                                 │
│  const query = {                │
│    queries: [...],              │
│    limit: 20                    │
│  };                             │
│                                 │
│  client.search(query)           │
└──────────────┬──────────────────┘
               │
               │ JavaScript object
               │
┌──────────────▼──────────────────┐
│  Client Package                 │
│  (@crm/clients)                │
│                                 │
│  - Converts to JSON             │
│  - Adds Authorization header    │
│  - Sends HTTP POST             │
└──────────────┬──────────────────┘
               │
               │ HTTP POST
               │ JSON body
               │
┌──────────────▼──────────────────┐
│  API Server                     │
│                                 │
│  - Validates with Zod           │
│  - Builds SQL conditions        │
│  - Executes query              │
│  - Returns results              │
└──────────────┬──────────────────┘
               │
               │ JSON response
               │
┌──────────────▼──────────────────┐
│  Client Package                 │
│                                 │
│  - Parses response              │
│  - Extracts data.items          │
│  - Returns typed results        │
└──────────────┬──────────────────┘
               │
               │ Typed object
               │
┌──────────────▼──────────────────┐
│  Frontend                       │
│                                 │
│  results.items.forEach(...)     │
└─────────────────────────────────┘
```

## Key Points

1. **Frontend constructs a plain JavaScript object** - No special encoding needed
2. **Client package handles HTTP** - Frontend just calls `client.search(query)`
3. **Type-safe** - TypeScript ensures correct types throughout
4. **Standard HTTP POST** - JSON body, standard headers
5. **Automatic parsing** - Client extracts `data.items` automatically

## Example: Complete Flow

```typescript
// 1. Frontend constructs query
import { CompanyClient } from '@crm/clients';
import { SearchOperator } from '@crm/shared';

const client = new CompanyClient();

const query = {
  queries: [
    { field: 'status', operator: SearchOperator.EQUALS, value: 'active' }
  ],
  limit: 20
};

// 2. Client sends HTTP request (automatic)
const results = await client.search(query);

// 3. Frontend uses results
console.log(results.items);  // Array of customers
console.log(results.total);   // Total count
```

That's it! The frontend just constructs a JavaScript object and calls a method. The client package handles everything else.
