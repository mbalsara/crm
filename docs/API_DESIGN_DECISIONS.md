# API Design Decisions Summary

## 1. RequestHeader Passing

### Decision: Extract from JWT Token (HTTP Authorization Header)

**How it works:**
- Client sends: `Authorization: Bearer <JWT_TOKEN>`
- Middleware validates JWT and extracts `userId` and `tenantId` from token claims
- RequestHeader attached to Hono context
- Available in all route handlers via `c.get<RequestHeader>('requestHeader')`

**Why:**
- ✅ Single source of truth (all auth context in token)
- ✅ Secure (cryptographically signed, can't spoof)
- ✅ Standard pattern (industry standard)
- ✅ Stateless (no DB lookup needed)
- ✅ Works with API keys too (encode in JWT)

**Implementation:**
- See `docs/REQUEST_HEADER_DESIGN.md` for full details
- Middleware validates JWT → extracts claims → creates RequestHeader
- Development mode: Can use hardcoded values for local dev

**Client Usage:**
```typescript
fetch('/api/companies', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

---

## 2. Search API Design

### Decision: Operator-Based Query Model

**Request Structure:**
```typescript
{
  queries: [
    { field: "status", operator: "eq", value: "active" },
    { field: "createdAt", operator: "gte", value: "2024-01-01" },
    { field: "name", operator: "like", value: "%acme%" }
  ],
  sortBy: "createdAt",
  sortOrder: "desc",
  limit: 20,
  offset: 0
}
```

**Operators:**
- `eq`, `ne` - Equals/Not equals
- `gt`, `gte`, `lt`, `lte` - Comparisons
- `like` - Pattern matching
- `in`, `notIn` - Array membership

**Architecture:**
```
Route → Service → Repository
  ↓       ↓         ↓
Validate  Build     Execute
Schema    SQL       Query
          Conditions
```

**Key Features:**
1. **Field Mapping**: Each resource defines API fields → DB columns
2. **Automatic Tenant Isolation**: Service adds tenant condition
3. **Type-Safe**: Zod schemas validate everything
4. **SQL Injection Safe**: Uses Drizzle ORM (parameterized queries)
5. **Performant**: Maps directly to SQL, supports indexes

**Example Flow:**
```typescript
// 1. Route validates searchRequestSchema
// 2. Service builds field mapping
const fieldMapping = {
  name: companies.name,
  status: companies.status,
  createdAt: companies.createdAt,
};

// 3. Service converts queries → SQL conditions
const conditions = buildSearchConditions(queries, fieldMapping);

// 4. Service adds tenant isolation
const where = and(conditions, eq(companies.tenantId, tenantId));

// 5. Repository executes query
const results = await repository.search({ where, sortBy, limit, offset });

// 6. Service converts DB → Response objects
return { items: results.items.map(toResponse), total: results.total };
```

**See `docs/SEARCH_API_DESIGN.md` for full details**

---

## Complete Request Flow

```
1. Client Request
   ↓
   Headers: Authorization: Bearer <JWT>
   Body: { queries: [...], limit: 20 }
   ↓
2. Middleware: requestHeaderMiddleware
   ↓
   Validates JWT → Extracts userId, tenantId
   Creates RequestHeader → Attaches to context
   ↓
3. Route Handler
   ↓
   Extracts RequestHeader from context
   Validates request body with Zod
   Calls service
   ↓
4. Service Layer
   ↓
   Receives RequestHeader + validated request
   Enforces tenant isolation
   Builds search conditions
   Calls repository
   Converts DB objects → Response objects
   ↓
5. Repository Layer
   ↓
   Executes SQL query
   Returns results
   ↓
6. Route Handler
   ↓
   Returns ApiResponse<SearchResponse>
```

---

## Security Considerations

### RequestHeader
- ✅ JWT signature validation
- ✅ Token expiration checking
- ✅ Required claims validation (userId, tenantId)
- ✅ HTTPS only in production

### Search API
- ✅ Tenant isolation (automatic in service layer)
- ✅ Field validation (only allowed fields searchable)
- ✅ SQL injection prevention (Drizzle ORM)
- ✅ Query limits (max 20 queries, max 100 results)
- ✅ Input validation (Zod schemas)

---

## Migration Path

### Phase 1: Current State
- Hardcoded RequestHeader values
- No search APIs

### Phase 2: Add JWT Support
- Implement JWT validation middleware
- Keep hardcoded fallback for dev
- Update clients to send JWT tokens

### Phase 3: Add Search APIs
- Implement search utilities
- Add search endpoints for each resource
- Define field mappings

### Phase 4: Production Ready
- Remove hardcoded fallback
- Add refresh token support
- Add API key support
- Add rate limiting

---

## Files Created

1. **docs/REQUEST_HEADER_DESIGN.md** - Complete RequestHeader design
2. **docs/SEARCH_API_DESIGN.md** - Complete Search API design
3. **docs/API_DESIGN_DECISIONS.md** - This summary

## Next Steps

1. ✅ Review designs
2. ⏳ Implement JWT validation middleware
3. ⏳ Implement search utilities
4. ⏳ Add search endpoints
5. ⏳ Update clients to use JWT tokens
