# API Conventions Summary

This is a quick reference guide for the API conventions. See [API_CONVENTIONS.md](./API_CONVENTIONS.md) for full documentation.

## Quick Checklist

When creating a new API endpoint:

- [ ] RequestHeader extracted from context (`c.get<RequestHeader>('requestHeader')`)
- [ ] Request validated with Zod schema (`.parse()`)
- [ ] Service method accepts `(requestHeader: RequestHeader, request: XXXRequest)`
- [ ] Service returns response object (not database object)
- [ ] Standard `ApiResponse<T>` format used
- [ ] Errors thrown as `AppError` subclasses
- [ ] Error middleware applied (`errorHandler`)
- [ ] RequestHeader middleware applied (`requestHeaderMiddleware`)
- [ ] Tenant isolation enforced using `requestHeader.tenantId`

## Standard Route Pattern

```typescript
import { handleApiRequest } from '../utils/api-handler';
import { createResourceRequestSchema } from '@crm/clients';

app.post('/', async (c) => {
  return handleApiRequest(
    c,
    createResourceRequestSchema,
    async (requestHeader, request) => {
      const service = container.resolve(ResourceService);
      return await service.create(requestHeader, request);
    }
  );
});
```

## Standard Service Pattern

```typescript
@injectable()
export class ResourceService {
  constructor(
    private repository: ResourceRepository,
    private db: Database
  ) {}

  async create(
    requestHeader: RequestHeader,
    request: CreateResourceRequest,
    tx?: Transaction
  ): Promise<ResourceResponse> {
    // Enforce tenant isolation
    if (request.tenantId !== requestHeader.tenantId) {
      throw new ForbiddenError('Cannot access different tenant');
    }
    
    // Execute in transaction
    const execute = async (transaction: Transaction) => {
      const resourceDb = await this.repository.create(data, transaction);
      return this.toResponse(resourceDb);
    };
    
    if (tx) {
      return await execute(tx);
    } else {
      return await this.db.transaction(execute);
    }
  }
}
```

## Error Types

| Error | Code | Status | When to Use |
|-------|------|--------|-------------|
| `ValidationError` | `VALIDATION_ERROR` | 400 | Zod validation failures |
| `NotFoundError` | `NOT_FOUND` | 404 | Resource not found |
| `DuplicateEntryError` | `DUPLICATE_ENTRY` | 409 | Unique constraint violation |
| `ConflictError` | `CONFLICT` | 409 | Business logic conflict |
| `UnauthorizedError` | `UNAUTHORIZED` | 401 | Authentication required |
| `ForbiddenError` | `FORBIDDEN` | 403 | Insufficient permissions |

## Search API Pattern

```typescript
import { searchRequestSchema, SearchRequest } from '@crm/shared';
import { buildSearchConditions } from '../utils/search-utils';

app.post('/search', async (c) => {
  return handleApiRequest(
    c,
    searchRequestSchema,
    async (requestHeader, searchRequest) => {
      const fieldMapping = {
        name: customers.name,
        status: customers.status,
        createdAt: customers.createdAt,
      };
      
      const conditions = buildSearchConditions(
        searchRequest.queries,
        fieldMapping
      );
      
      // Add tenant isolation
      conditions.push(eq(customers.tenantId, requestHeader.tenantId));
      
      const results = await repository.search({
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
  );
});
```

## Files Created

1. **docs/API_CONVENTIONS.md** - Full API conventions documentation
2. **packages/shared/src/search/types.ts** - Search query schemas and types
3. **apps/api/src/utils/search-utils.ts** - Search query building utilities
4. **apps/api/src/utils/request-header.ts** - RequestHeader extraction utility
5. **apps/api/src/utils/api-handler.ts** - Standard API handler helpers
6. **apps/api/src/customers/routes.example.ts** - Example route implementation

## Key Decisions

1. **RequestHeader + XXXRequest pattern**: All APIs follow this signature
2. **Zod validation**: All requests/responses validated with Zod schemas
3. **Separate value objects**: Database objects converted to API response objects
4. **Transaction support**: Services accept optional transaction parameter
5. **Search operators**: Simple operator-based search model (eq, ne, gt, like, in, etc.)
6. **Error middleware**: Automatic error conversion and sanitization
7. **No GraphQL**: Start with REST, add GraphQL later if needed
