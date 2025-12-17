# GET vs POST for Search Endpoints

## The Question

Should search endpoints use **GET** (query parameters) or **POST** (request body)?

## Comparison

### GET with Query Parameters

```typescript
// Request
GET /api/customers/search?status=active&name=tech&limit=20&offset=0

// Or more complex:
GET /api/customers/search?
  filters[0][field]=status&
  filters[0][operator]=eq&
  filters[0][value]=active&
  filters[1][field]=name&
  filters[1][operator]=like&
  filters[1][value]=%tech%&
  limit=20&offset=0
```

**Pros:**
- ✅ RESTful convention (GET for read operations)
- ✅ Cacheable (browsers/proxies can cache)
- ✅ Bookmarkable/shareable URLs
- ✅ Idempotent (safe to retry)
- ✅ Standard HTTP semantics
- ✅ Browser back/forward works

**Cons:**
- ❌ URL length limits (~2000 chars in some browsers/servers)
- ❌ Complex queries get messy/ugly
- ❌ Hard to send arrays/objects
- ❌ Query params visible in logs/history (security concern)
- ❌ Encoding issues with special characters

### POST with Request Body

```typescript
// Request
POST /api/customers/search
Body: {
  queries: [
    { field: "status", operator: "eq", value: "active" },
    { field: "name", operator: "like", value: "%tech%" }
  ],
  limit: 20,
  offset: 0
}
```

**Pros:**
- ✅ No URL length limits
- ✅ Clean JSON structure
- ✅ Easy to send arrays/objects
- ✅ More secure (not in URL/logs)
- ✅ Easier to extend with complex operators
- ✅ Better for complex queries

**Cons:**
- ❌ Not cacheable by default
- ❌ Not bookmarkable
- ❌ Not RESTful convention (POST is for creating)
- ❌ Browser back/forward doesn't work naturally

## Industry Examples

### Using POST for Search

- **Elasticsearch**: `POST /_search` (complex query DSL)
- **GraphQL**: Always POST (even for queries)
- **Google Cloud APIs**: Many use POST for complex searches
- **Stripe API**: Uses POST for list/search endpoints
- **GitHub API**: Uses POST for complex searches

### Using GET for Search

- **REST APIs**: Simple filters use GET
- **Twitter API**: `GET /search/tweets?q=...`
- **Google Search API**: `GET /customsearch/v1?q=...`

## Recommendation: **POST for Search**

### Why POST Makes Sense for Your Use Case

1. **Complex Query Structure**
   ```typescript
   // Your search queries can have:
   - Multiple queries (up to 20)
   - Complex operators (like, in, notIn)
   - Arrays as values: { operator: "in", value: ["a", "b", "c"] }
   - Nested structures
   
   // This would be VERY messy in URL:
   GET /search?queries[0][field]=status&queries[0][operator]=eq&queries[0][value]=active&queries[1][field]=tags&queries[1][operator]=in&queries[1][value][0]=tech&queries[1][value][1]=startup
   ```

2. **URL Length Limits**
   - Browsers: ~2000 characters
   - Some proxies/servers: ~8000 characters
   - Your queries can easily exceed this with multiple filters

3. **Security**
   - Query params appear in:
     - Browser history
     - Server logs
     - Referrer headers
     - Analytics tools
   - POST body is more secure (not in URL)

4. **Consistency**
   - All search endpoints use same pattern
   - Easier to maintain
   - Easier to extend

5. **Future-Proof**
   - Easy to add:
     - OR conditions
     - Nested queries
     - Full-text search
     - Aggregations

### When GET Would Be Better

GET makes sense for:
- **Simple, single-field searches**: `GET /customers?status=active`
- **Bookmarkable filters**: User wants to bookmark a search
- **Caching important**: Results rarely change, want browser cache

## Hybrid Approach (Optional)

You could support both:

```typescript
// Simple searches: GET
GET /api/customers?status=active&limit=20

// Complex searches: POST
POST /api/customers/search
Body: { queries: [...], limit: 20 }
```

**But this adds complexity:**
- Two different endpoints to maintain
- Two different validation schemas
- Confusion about which to use when

## Final Recommendation

**Use POST for all search endpoints** because:

1. ✅ Your queries are complex (multiple filters, operators, arrays)
2. ✅ URL length limits would be problematic
3. ✅ More secure (not in URL)
4. ✅ Consistent pattern
5. ✅ Industry standard for complex searches

### Implementation

```typescript
// Route
app.post('/customers/search', async (c) => {
  return handleApiRequest(
    c,
    searchRequestSchema,
    async (requestHeader, searchRequest) => {
      const service = container.resolve(CompanyService);
      return await service.search(requestHeader, searchRequest);
    }
  );
});
```

### Caching Alternative

If caching is important, you can:
1. **Add cache headers** to POST responses:
   ```typescript
   return c.json(response, 200, {
     'Cache-Control': 'public, max-age=60',
   });
   ```

2. **Use ETags** for conditional requests

3. **Client-side caching** in your frontend

### Bookmarking Alternative

If bookmarking is important:
1. **Encode search in URL hash**: `#search={"queries":[...]}`
2. **Store search state** in localStorage
3. **Use query params for simple filters**: `?status=active` (but still POST for complex)

## Decision Matrix

| Factor | GET | POST | Winner |
|--------|-----|------|--------|
| RESTful convention | ✅ | ❌ | GET |
| URL length limits | ❌ | ✅ | POST |
| Complex queries | ❌ | ✅ | POST |
| Caching | ✅ | ⚠️ | GET (but can add to POST) |
| Security | ❌ | ✅ | POST |
| Bookmarking | ✅ | ❌ | GET |
| Consistency | ⚠️ | ✅ | POST |
| Your use case | ❌ | ✅ | **POST** |

## Conclusion

**Recommendation: Use POST for search endpoints**

Your search queries are complex enough that GET would be problematic. POST is the right choice here, and it's a common pattern in modern APIs (Elasticsearch, GraphQL, Stripe, etc.).
