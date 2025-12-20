# API Conventions

This document defines the standard conventions for all APIs in the CRM platform to ensure consistency, maintainability, and developer experience.

## Table of Contents

1. [API Structure](#api-structure)
2. [Request/Response Format](#requestresponse-format)
3. [Error Handling](#error-handling)
4. [Validation](#validation)
5. [Search APIs](#search-apis)
6. [Scoped Queries (Access Control)](#scoped-queries-access-control)
7. [Service Layer](#service-layer)
8. [Database Transactions](#database-transactions)
9. [Data Transformation](#data-transformation)
10. [Async Operations](#async-operations)

---

## API Structure

### Standard API Signature

Every API endpoint MUST follow this structure:

```typescript
app.post('/resource', async (c: Context) => {
  // 1. Extract RequestHeader from context (set by middleware)
  const requestHeader = c.get<RequestHeader>('requestHeader');
  
  // 2. Parse and validate request body
  const body = await c.req.json();
  const validatedRequest = createResourceRequestSchema.parse(body);
  
  // 3. Call service with RequestHeader and validated request
  const service = container.resolve(ResourceService);
  const result = await service.create(requestHeader, validatedRequest);
  
  // 4. Return standardized response
  return c.json<ApiResponse<ResourceResponse>>({
    success: true,
    data: result,
  });
});
```

### Required Parameters

1. **RequestHeader** - Extracted from context (set by `requestHeaderMiddleware`)
   - Contains: `tenantId`, `userId`
   - Automatically populated by middleware from authentication headers
   - Available via `c.get<RequestHeader>('requestHeader')`

2. **XXXRequest** - Validated request body
   - Defined as Zod schema in `packages/clients/src/{resource}/types.ts`
   - Validated using `.parse()` which throws `ZodError` on failure
   - Errors are caught by middleware and converted to `ValidationError`

### Response Format

All responses MUST use `ApiResponse<T>` format:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;      // Present when success = true
  error?: StructuredError;  // Present when success = false
}
```

**Success Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "fields": [...],
    "statusCode": 400
  }
}
```

---

## Request/Response Format

### Request Schemas

All request types MUST be defined as Zod schemas in `packages/clients/src/{resource}/types.ts`:

```typescript
// packages/clients/src/company/types.ts
import { z } from 'zod';

export const createCompanyRequestSchema = z.object({
  tenantId: z.uuid(),
  domains: z.array(z.string().min(1).max(255)).min(1),
  name: z.string().optional(),
  website: z.string().url().optional(),
});

export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>;
```

### Response Schemas

All response types MUST also be defined as Zod schemas:

```typescript
export const companyResponseSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  domains: z.array(z.string()),
  name: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type CompanyResponse = z.infer<typeof companyResponseSchema>;
```

### Why Zod?

- **Type Safety**: TypeScript types derived from schemas
- **Runtime Validation**: Validates at API boundaries
- **Client/Server Consistency**: Same schemas used in client and server
- **Error Details**: Provides field-level error information

---

## Error Handling

### Error Response Structure

All errors follow the `StructuredError` format:

```typescript
interface StructuredError {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  fields?: FieldValidationError[];  // For validation errors
  statusCode: number;
}
```

### Well-Defined Error Types

#### Client Errors (Don't Retry)

| Error Class | Code | Status | Use Case |
|------------|------|--------|----------|
| `ValidationError` | `VALIDATION_ERROR` | 400 | Zod validation failures, field-level errors |
| `InvalidInputError` | `INVALID_INPUT` | 400 | Invalid input format (not validation) |
| `NotFoundError` | `NOT_FOUND` | 404 | Resource not found |
| `DuplicateEntryError` | `DUPLICATE_ENTRY` | 409 | Unique constraint violation |
| `ConflictError` | `CONFLICT` | 409 | Business logic conflict |
| `UnauthorizedError` | `UNAUTHORIZED` | 401 | Authentication required |
| `ForbiddenError` | `FORBIDDEN` | 403 | Insufficient permissions |

#### System Errors (May Retry)

| Error Class | Code | Status | Use Case |
|------------|------|--------|----------|
| `DatabaseError` | `DATABASE_ERROR` | 500/503 | Database operation failed |
| `DatabaseConnectionError` | `DATABASE_CONNECTION_ERROR` | 503 | Database connection failed |
| `ExternalServiceError` | `EXTERNAL_SERVICE_ERROR` | 502/503/504 | External API call failed |
| `ServiceUnavailableError` | `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |
| `RateLimitError` | `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |
| `InternalError` | `INTERNAL_ERROR` | 500 | Unexpected internal error |

### Error Handling Flow

1. **Route Handler**: Throws `AppError` subclass or lets Zod throw `ZodError`
2. **Error Middleware**: Catches all errors, converts to `StructuredError`
3. **Sanitization**: Internal errors sanitized before sending to client
4. **Response**: Returns `ApiResponse<never>` with error details

### Example Error Usage

```typescript
import { NotFoundError, DuplicateEntryError, ValidationError } from '@crm/shared';

// In service
if (!resource) {
  throw new NotFoundError('Company', id);
}

if (existingResource) {
  throw new DuplicateEntryError('Company', 'domain', domain);
}

// Zod validation errors are automatically converted to ValidationError by middleware
```

---

## Validation

### Validation Strategy

1. **Request Validation**: Use Zod `.parse()` at route boundary
   ```typescript
   const validatedRequest = createResourceRequestSchema.parse(body);
   ```

2. **Automatic Error Conversion**: `ZodError` → `ValidationError` by middleware
   - Field-level errors preserved in `fields` array
   - Error details include validation context

3. **Response Validation**: Validate service responses before returning
   ```typescript
   const response = companyResponseSchema.parse(result);
   return c.json({ success: true, data: response });
   ```

### Validation Error Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": { "errorCount": 2 },
    "fields": [
      {
        "field": "tenantId",
        "message": "Invalid uuid",
        "code": "invalid_string"
      },
      {
        "field": "domain",
        "message": "String must contain at least 1 character(s)",
        "code": "too_small"
      }
    ],
    "statusCode": 400
  }
}
```

---

## Search APIs

### Search Query Model

Search APIs use a simple, flexible query model with operators and values:

```typescript
// Search query schema
export const searchQuerySchema = z.object({
  field: z.string(),           // Field to search on
  operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'in', 'notIn']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.any())]),
});

export const searchRequestSchema = z.object({
  queries: z.array(searchQuerySchema).min(1).max(20),  // Max 20 queries
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
```

### Supported Operators

| Operator | Description | Value Type | Example |
|----------|-------------|------------|---------|
| `eq` | Equals | any | `{ field: "status", operator: "eq", value: "active" }` |
| `ne` | Not equals | any | `{ field: "status", operator: "ne", value: "deleted" }` |
| `gt` | Greater than | number/date | `{ field: "createdAt", operator: "gt", value: "2024-01-01" }` |
| `gte` | Greater than or equal | number/date | `{ field: "age", operator: "gte", value: 18 }` |
| `lt` | Less than | number/date | `{ field: "price", operator: "lt", value: 100 }` |
| `lte` | Less than or equal | number/date | `{ field: "score", operator: "lte", value: 100 }` |
| `like` | Pattern match (SQL LIKE) | string | `{ field: "name", operator: "like", value: "%acme%" }` |
| `in` | In array | array | `{ field: "status", operator: "in", value: ["active", "pending"] }` |
| `notIn` | Not in array | array | `{ field: "id", operator: "notIn", value: ["1", "2"] }` |

### Search API Example

```typescript
// Route
app.post('/customers/search', async (c) => {
  const requestHeader = c.get<RequestHeader>('requestHeader');
  const body = await c.req.json();
  const searchRequest = searchRequestSchema.parse(body);
  
  const service = container.resolve(CompanyService);
  const results = await service.search(requestHeader, searchRequest);
  
  return c.json<ApiResponse<SearchResponse<CompanyResponse>>>({
    success: true,
    data: results,
  });
});

// Service
async search(
  requestHeader: RequestHeader,
  searchRequest: SearchRequest
): Promise<SearchResponse<Company>> {
  // Convert search queries to database conditions
  const conditions = this.buildSearchConditions(searchRequest.queries);
  
  // Apply tenant isolation
  conditions.push(eq(customers.tenantId, requestHeader.tenantId));
  
  // Execute search with pagination
  const results = await this.repository.search({
    conditions,
    sortBy: searchRequest.sortBy,
    sortOrder: searchRequest.sortOrder,
    limit: searchRequest.limit,
    offset: searchRequest.offset,
  });
  
  return {
    items: results.items,
    total: results.total,
    limit: searchRequest.limit,
    offset: searchRequest.offset,
  };
}
```

### Search Response Format

```typescript
interface SearchResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
```

---

## Scoped Queries (Access Control)

### Overview

All data access MUST be scoped to:
1. **Tenant isolation** - Users can only access their tenant's data
2. **Company access control** - Users can only access customers they or their reports are assigned to

This is enforced using **scoped queries** - explicit filters added to every database query.

### Access Model

An employee has access to customers through the organizational hierarchy:

```
Employee logs in
    ↓
Query employee_hierarchy (closure table)
    ↓
Find all descendants (including self)
    ↓
Query employee_customers for all descendants
    ↓
Result: Set of accessible company IDs
    ↓
All queries filter by these company IDs
```

### Why Scoped Queries (Not RLS)

We chose explicit scoped queries over PostgreSQL Row-Level Security:

| Aspect | Scoped Queries | RLS |
|--------|----------------|-----|
| Visibility | Explicit in code | Hidden |
| Debugging | Easy | Difficult |
| Testing | Simple | Complex |
| Performance | Predictable | Variable |
| Flexibility | Per-query control | Per-table only |

See [ACCESS_CONTROL_DESIGN.md](./ACCESS_CONTROL_DESIGN.md) for full comparison.

### Base Repository Pattern

All repositories that access company-scoped data MUST extend `ScopedRepository`:

```typescript
import { ScopedRepository } from '@crm/database';
import type { RequestHeader } from '@crm/shared';

@injectable()
export class ContactRepository extends ScopedRepository {

  async findAll(header: RequestHeader): Promise<Contact[]> {
    return this.db
      .select()
      .from(contacts)
      .where(this.accessFilter(
        contacts.tenantId,
        contacts.customerId,
        header
      ));
  }
}
```

The `ScopedRepository` provides access control methods that use `RequestHeader.permissions` to determine admin status:

```typescript
// Service layer - pass RequestHeader directly
async list(header: RequestHeader): Promise<Contact[]> {
  return this.repository.findAll(header);
}
```

### Scoped Search Builder

For complex queries with multiple filters, use `ScopedSearchBuilder`:

```typescript
import { scopedSearch } from '@crm/database';

const where = scopedSearch(contacts, {
  tenantId: contacts.tenantId,
  customerId: contacts.customerId,
  email: contacts.email,
  name: contacts.name,
}, context)
  .withCompanyScope()              // Add company access filter
  .applyQueries(request.queries)   // Add user's search filters
  .whereEq(contacts.status, 'active')  // Add fixed filter
  .build();
```

### Update/Delete with Access Check

Updates and deletes MUST include access filters in the WHERE clause:

```typescript
async update(context: AccessContext, id: string, data: Partial<Contact>): Promise<Contact> {
  const [updated] = await this.db
    .update(contacts)
    .set(data)
    .where(and(
      eq(contacts.id, id),
      this.accessFilter(contacts.tenantId, contacts.customerId, context)
    ))
    .returning();

  if (!updated) {
    // Could be not found OR no access - check which
    const exists = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, id))
      .limit(1);

    if (exists.length === 0) {
      throw new NotFoundError('Contact not found');
    } else {
      throw new ForbiddenError('Access denied');
    }
  }

  return updated;
}
```

### RequestHeader Requirements

`RequestHeader` MUST include `employeeId` for access control:

```typescript
interface RequestHeader {
  tenantId: string;
  userId: string;
  employeeId: string;  // Required for scoped queries
}
```

### Full Documentation

See [ACCESS_CONTROL_DESIGN.md](./ACCESS_CONTROL_DESIGN.md) for:
- Complete implementation details
- All helper methods
- Testing patterns
- Performance considerations

---

## Service Layer

### Service Interface Pattern

All services MUST follow this pattern:

```typescript
@injectable()
export class ResourceService {
  constructor(
    private repository: ResourceRepository,
    private db: Database  // Injected for transaction support
  ) {}

  async create(
    requestHeader: RequestHeader,
    request: CreateResourceRequest
  ): Promise<ResourceResponse> {
    // Business logic here
    // Call repository methods
    // Handle errors
  }
}
```

### Service Rules

1. **No Direct Database Access**: Services MUST use repositories, never direct database queries
2. **Exception**: Complex multi-table queries can use raw SQL via repository
3. **Business Logic**: All business logic belongs in services, not repositories
4. **Error Handling**: Services throw `AppError` subclasses
5. **Tenant Isolation**: Services enforce tenant isolation using `requestHeader.tenantId`

### Service Method Signature

```typescript
async methodName(
  requestHeader: RequestHeader,
  request: XXXRequest,
  tx?: Transaction  // Optional transaction
): Promise<XXXResponse>
```

---

## Database Transactions

### Transaction Support Pattern

Services MUST support both:
1. **Creating their own transaction** (default)
2. **Accepting an existing transaction** (for multi-service operations)

### Implementation Pattern

```typescript
@injectable()
export class ResourceService {
  constructor(private db: Database) {}

  async create(
    requestHeader: RequestHeader,
    request: CreateResourceRequest,
    tx?: Transaction
  ): Promise<ResourceResponse> {
    // If transaction provided, use it; otherwise create new one
    const execute = async (transaction: Transaction) => {
      // Use transaction for all database operations
      const resource = await this.repository.create(transaction, data);
      // ... more operations
      return resource;
    };

    if (tx) {
      // Use provided transaction
      return await execute(tx);
    } else {
      // Create new transaction
      return await this.db.transaction(async (tx) => {
        return await execute(tx);
      });
    }
  }
}
```

### Multi-Service Transactions

```typescript
// In a composite service or route handler
await db.transaction(async (tx) => {
  const company = await companyService.create(requestHeader, companyRequest, tx);
  const contact = await contactService.create(requestHeader, contactRequest, tx);
  // Both operations in same transaction
});
```

### Repository Transaction Support

Repositories MUST accept optional transaction parameter:

```typescript
async create(
  data: NewResource,
  tx?: Transaction
): Promise<Resource> {
  const db = tx || this.db;
  return await db.insert(resources).values(data).returning();
}
```

---

## Data Transformation

### Value Objects vs Database Objects

**Recommendation: Use separate value and database objects**

#### Why Separate?

1. **Type Safety**: Database enums (integers) vs API enums (strings)
2. **Foreign Keys**: Return `{ id, name }` instead of just `id`
3. **Computed Fields**: Add calculated fields not in database
4. **API Evolution**: Change API without changing database schema
5. **Security**: Hide internal database structure

#### Pattern

```typescript
// Database object (internal)
interface CompanyDb {
  id: string;
  tenantId: string;
  name: string | null;
  status: number;  // Enum as integer
  industryId: string;  // Foreign key
}

// Value object (API response)
interface CompanyResponse {
  id: string;
  tenantId: string;
  name: string | null;
  status: 'active' | 'inactive' | 'archived';  // Enum as string
  industry: { id: string; name: string };  // Expanded foreign key
  createdAt: Date;
  updatedAt: Date;
}

// Conversion in service
private toResponse(db: CompanyDb, industry: Industry): CompanyResponse {
  return {
    id: db.id,
    tenantId: db.tenantId,
    name: db.name,
    status: this.mapStatusEnum(db.status),
    industry: { id: industry.id, name: industry.name },
    createdAt: db.createdAt,
    updatedAt: db.updatedAt,
  };
}
```

#### Alternative: GraphQL

If you need:
- **Complex nested queries**: GraphQL provides better flexibility
- **Client-driven field selection**: Clients request only needed fields
- **Relationship traversal**: Easy to fetch related resources

**However**, GraphQL adds complexity:
- Schema definition and maintenance
- Resolver implementation
- Caching strategies
- Error handling complexity

**Recommendation**: Start with REST + separate value objects. Add GraphQL later if needed.

---

## Async Operations

### Long-Running Operations

For operations that take > 5 seconds or are resource-intensive:

1. **Trigger async job** via Inngest
2. **Return job ID** immediately
3. **Client polls** for completion or uses webhooks

### Pattern

```typescript
// Route handler
app.post('/customers/bulk-import', async (c) => {
  const requestHeader = c.get<RequestHeader>('requestHeader');
  const body = await c.req.json();
  const request = bulkImportRequestSchema.parse(body);
  
  // Trigger async job
  const jobId = await inngest.send({
    name: 'customers/bulk-import',
    data: {
      requestHeader,
      request,
    },
  });
  
  return c.json<ApiResponse<{ jobId: string }>>({
    success: true,
    data: { jobId },
  });
});

// Inngest function
inngest.createFunction(
  { id: 'bulk-import-customers' },
  { event: 'customers/bulk-import' },
  async ({ event }) => {
    const { requestHeader, request } = event.data;
    const service = container.resolve(CompanyService);
    await service.bulkImport(requestHeader, request);
  }
);
```

### Job Status Endpoint

```typescript
app.get('/jobs/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const status = await getJobStatus(jobId);
  
  return c.json<ApiResponse<JobStatus>>({
    success: true,
    data: status,
  });
});
```

---

## Complete Example

### Route Handler

```typescript
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { errorHandler } from '../middleware/errorHandler';
import { requestHeaderMiddleware } from '../middleware/requestHeader';
import type { RequestHeader, ApiResponse } from '@crm/shared';
import { CompanyService } from './service';
import { createCompanyRequestSchema, companyResponseSchema } from '@crm/clients';

const app = new Hono();

// Apply middleware
app.use('*', errorHandler);
app.use('*', requestHeaderMiddleware);

app.post('/', async (c) => {
  // 1. Extract RequestHeader
  const requestHeader = c.get<RequestHeader>('requestHeader');
  
  // 2. Parse and validate request
  const body = await c.req.json();
  const validatedRequest = createCompanyRequestSchema.parse(body);
  
  // 3. Call service
  const service = container.resolve(CompanyService);
  const result = await service.create(requestHeader, validatedRequest);
  
  // 4. Validate response (optional but recommended)
  const response = companyResponseSchema.parse(result);
  
  // 5. Return standardized response
  return c.json<ApiResponse<typeof response>>({
    success: true,
    data: response,
  }, 201);
});
```

### Service

```typescript
@injectable()
export class CompanyService {
  constructor(
    private repository: CompanyRepository,
    private db: Database
  ) {}

  async create(
    requestHeader: RequestHeader,
    request: CreateCompanyRequest,
    tx?: Transaction
  ): Promise<CompanyResponse> {
    // Enforce tenant isolation
    if (request.tenantId !== requestHeader.tenantId) {
      throw new ForbiddenError('Cannot create company for different tenant');
    }
    
    // Check for duplicates
    const existing = await this.repository.findByDomain(
      requestHeader.tenantId,
      request.domains[0]
    );
    if (existing) {
      throw new DuplicateEntryError('Company', 'domain', request.domains[0]);
    }
    
    // Execute in transaction
    const execute = async (transaction: Transaction) => {
      const companyDb = await this.repository.create(
        { ...request, tenantId: requestHeader.tenantId },
        transaction
      );
      
      // Convert to response format
      return this.toResponse(companyDb);
    };
    
    if (tx) {
      return await execute(tx);
    } else {
      return await this.db.transaction(execute);
    }
  }
  
  private toResponse(db: CompanyDb): CompanyResponse {
    // Transform database object to API response
    return {
      id: db.id,
      tenantId: db.tenantId,
      domains: db.domains,
      name: db.name,
      createdAt: db.createdAt,
      updatedAt: db.updatedAt,
    };
  }
}
```

---

## Checklist

When creating a new API endpoint:

- [ ] RequestHeader extracted from context
- [ ] Request validated with Zod schema
- [ ] Service method accepts RequestHeader and validated request
- [ ] Service returns response object (not database object)
- [ ] Response validated with Zod schema (optional but recommended)
- [ ] Standard ApiResponse format used
- [ ] Errors thrown as AppError subclasses
- [ ] Error middleware applied
- [ ] Tenant isolation enforced
- [ ] Transaction support implemented (if needed)
- [ ] Long-running operations use Inngest
- [ ] Search APIs use search query model
