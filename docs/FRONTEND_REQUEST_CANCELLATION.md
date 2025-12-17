# Frontend Request Cancellation & Race Condition Handling

## The Problem

When users interact quickly (typing, clicking multiple times), multiple AJAX requests can be in flight simultaneously. Older, slower requests can overwrite newer, faster responses, causing:

- **Stale data**: Older response overwrites newer data
- **Wrong results**: User sees results for "acme" when they searched for "tech"
- **Poor UX**: Page flickers, shows wrong data briefly

### Example Scenario

```
Time: 0ms    User types "a" → Request A starts
Time: 100ms  User types "ac" → Request B starts  
Time: 200ms  User types "acm" → Request C starts
Time: 300ms  User types "acme" → Request D starts

Time: 500ms  Request D completes (fast) → Shows "acme" results ✅
Time: 800ms  Request C completes (slow) → Overwrites with "acm" results ❌
Time: 1000ms Request B completes (slow) → Overwrites with "ac" results ❌
Time: 1200ms Request A completes (slow) → Overwrites with "a" results ❌
```

## Solutions

### Solution 1: AbortController (Recommended)

**Modern, standard approach** - Cancel previous requests when new one starts.

#### Implementation in Base Client

```typescript
// packages/clients/src/base-client.ts
import { withRetry } from '@crm/shared';

export abstract class BaseClient {
  protected baseUrl: string;
  protected enableLogging: boolean;
  
  // Track active requests by endpoint
  private activeRequests = new Map<string, AbortController>();

  constructor() {
    this.baseUrl = process.env.SERVICE_API_URL!;
    const logLevel = process.env.LOG_LEVEL || 'info';
    this.enableLogging =
      process.env.HTTP_CLIENT_LOGGING === 'true' ||
      logLevel === 'debug';
  }

  /**
   * Cancel previous request for same endpoint
   */
  protected cancelPreviousRequest(endpoint: string) {
    const existing = this.activeRequests.get(endpoint);
    if (existing) {
      existing.abort();
      this.activeRequests.delete(endpoint);
    }
  }

  /**
   * Core request method with cancellation support
   */
  protected async request<T>(
    path: string,
    options: RequestInit = {},
    cancelPrevious: boolean = false
  ): Promise<T | null> {
    // Cancel previous request if requested
    if (cancelPrevious) {
      this.cancelPreviousRequest(path);
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    this.activeRequests.set(path, abortController);

    const startTime = Date.now();
    const method = options.method || 'GET';
    const requestBody = options.body ? JSON.parse(options.body as string) : undefined;

    if (this.enableLogging) {
      console.log(`[HTTP Client] → ${method} ${this.baseUrl}${path}`);
      if (requestBody) {
        console.log('[HTTP Client] Request body:', JSON.stringify(requestBody, null, 2));
      }
    }

    try {
      return await withRetry<T | null>(
        async (): Promise<T | null> => {
          try {
            const fullUrl = `${this.baseUrl}${path}`;

            const response = await fetch(fullUrl, {
              ...options,
              signal: abortController.signal, // Attach abort signal
            });

            const duration = Date.now() - startTime;

            // Check if request was aborted
            if (abortController.signal.aborted) {
              throw new Error('Request was cancelled');
            }

            this.log(method, path, response.status, duration);

            if (!response.ok) {
              if (response.status === 404) return null;

              // Handle errors...
              const error: any = new Error(`${method} ${path} failed: ${response.statusText}`);
              error.status = response.status;
              throw error;
            }

            if (response.status === 204) return null;

            const responseData = (await response.json()) as T;
            return responseData;
          } catch (error: any) {
            // Don't throw error if request was aborted (expected)
            if (error.name === 'AbortError' || abortController.signal.aborted) {
              if (this.enableLogging) {
                console.log(`[HTTP Client] Request cancelled: ${path}`);
              }
              throw error; // Re-throw to stop retry logic
            }
            throw error;
          }
        },
        {
          maxRetries: 3,
          shouldRetry: (error: any) => {
            // Don't retry aborted requests
            if (error.name === 'AbortError' || error.message === 'Request was cancelled') {
              return false;
            }
            const status = error?.status;
            return status === 429 || status === 502 || status === 503 || status === 504;
          },
        }
      );
    } finally {
      // Clean up
      this.activeRequests.delete(path);
    }
  }

  /**
   * Search with automatic cancellation of previous search
   */
  protected async search<TResponse>(
    path: string,
    request: any
  ): Promise<SearchResponse<TResponse>> {
    const response = await this.post<ApiResponse<SearchResponse<TResponse>>>(
      path,
      request,
      true // Cancel previous request
    );
    
    if (!response?.data) {
      throw new Error('Invalid API response: missing data');
    }
    
    return response.data;
  }
}
```

#### Usage in Resource Clients

```typescript
// packages/clients/src/company/client.ts
export class CompanyClient extends BaseClient {
  async search(request: SearchRequest): Promise<SearchResponse<Company>> {
    // BaseClient.search() automatically cancels previous search
    return this.search<Company>('/api/customers/search', request);
  }
}
```

### Solution 2: Request ID Tracking

**Alternative approach** - Track request order, ignore stale responses.

#### Implementation

```typescript
// hooks/useCompanySearch.ts
import { useState, useRef } from 'react';
import { CompanyClient } from '@crm/clients';
import type { SearchRequest, SearchResponse } from '@crm/shared';
import type { Company } from '@crm/clients';

const client = new CompanyClient();

export function useCompanySearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [results, setResults] = useState<SearchResponse<Company> | null>(null);
  
  // Track request ID
  const requestIdRef = useRef(0);

  const search = async (request: SearchRequest) => {
    // Increment request ID
    const currentRequestId = ++requestIdRef.current;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await client.search(request);
      
      // Only update if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setResults(data);
      } else {
        // Stale request - ignore
        console.log('Ignoring stale search result');
      }
    } catch (err) {
      // Only set error if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setError(err instanceof Error ? err : new Error('Search failed'));
      }
    } finally {
      // Only update loading if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  return { search, loading, error, results };
}
```

### Solution 3: Debouncing (Prevent Multiple Requests)

**Prevent rapid requests** - Wait for user to stop typing before searching.

#### Implementation

```typescript
// hooks/useDebounce.ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Usage
export function CompanySearchWithDebounce() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // Wait 300ms
  const { search, loading, results } = useCompanySearch();

  useEffect(() => {
    if (!debouncedSearchTerm) return;

    search({
      queries: [
        { field: 'name', operator: 'like', value: `%${debouncedSearchTerm}%` }
      ],
      limit: 20,
    });
  }, [debouncedSearchTerm]);

  return (
    <input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search customers..."
    />
  );
}
```

### Solution 4: Combined Approach (Recommended)

**Use both debouncing AND cancellation** for best UX.

#### Complete Implementation

```typescript
// hooks/useCompanySearch.ts
import { useState, useRef, useCallback } from 'react';
import { CompanyClient } from '@crm/clients';
import type { SearchRequest, SearchResponse } from '@crm/shared';
import type { Company } from '@crm/clients';

const client = new CompanyClient();

export function useCompanySearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [results, setResults] = useState<SearchResponse<Company> | null>(null);
  
  // Track request ID for race condition protection
  const requestIdRef = useRef(0);
  
  // AbortController for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async (request: SearchRequest) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Increment request ID
    const currentRequestId = ++requestIdRef.current;
    
    setLoading(true);
    setError(null);
    
    try {
      // Note: You'll need to modify client to accept AbortController
      const data = await client.search(request, abortController.signal);
      
      // Check if request was aborted
      if (abortController.signal.aborted) {
        return;
      }
      
      // Only update if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setResults(data);
      }
    } catch (err: any) {
      // Ignore abort errors
      if (err.name === 'AbortError') {
        return;
      }
      
      // Only set error if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setError(err instanceof Error ? err : new Error('Search failed'));
      }
    } finally {
      // Only update loading if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { search, loading, error, results };
}
```

#### Enhanced Client with AbortController Support

```typescript
// packages/clients/src/base-client.ts
export abstract class BaseClient {
  /**
   * POST request with optional AbortSignal
   */
  protected async post<T>(
    path: string,
    body: any,
    signal?: AbortSignal
  ): Promise<T> {
    const result = await this.request<T>(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal, // Pass abort signal
      }
    );
    
    if (result === null) {
      throw new Error(`POST ${path} returned null response`);
    }
    
    return result;
  }
}

// packages/clients/src/company/client.ts
export class CompanyClient extends BaseClient {
  async search(
    request: SearchRequest,
    signal?: AbortSignal
  ): Promise<SearchResponse<Company>> {
    const response = await this.post<ApiResponse<SearchResponse<Company>>>(
      '/api/customers/search',
      request,
      signal
    );
    
    if (!response?.data) {
      throw new Error('Invalid API response: missing data');
    }
    
    return response.data;
  }
}
```

## React Component Example

```typescript
// components/CompanySearch.tsx
import { useState, useEffect } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { useCompanySearch } from '../hooks/useCompanySearch';
import { SearchOperator } from '@crm/shared';

export function CompanySearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Debounce search term (wait 300ms after user stops typing)
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  const { search, loading, error, results } = useCompanySearch();

  // Search when debounced term or filter changes
  useEffect(() => {
    const queries = [];
    
    if (debouncedSearchTerm) {
      queries.push({
        field: 'name',
        operator: SearchOperator.LIKE,
        value: `%${debouncedSearchTerm}%`,
      });
    }
    
    if (statusFilter) {
      queries.push({
        field: 'status',
        operator: SearchOperator.EQUALS,
        value: statusFilter,
      });
    }

    if (queries.length > 0) {
      search({
        queries,
        limit: 20,
        offset: 0,
      });
    }
  }, [debouncedSearchTerm, statusFilter, search]);

  return (
    <div>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search customers..."
      />
      
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>

      {loading && <div>Searching...</div>}
      {error && <div>Error: {error.message}</div>}
      
      {results && (
        <div>
          <p>Found {results.total} customers</p>
          <ul>
            {results.items.map((company) => (
              <li key={company.id}>{company.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

## Comparison

| Solution | Pros | Cons | Best For |
|----------|------|------|----------|
| **AbortController** | ✅ Cancels network request<br>✅ Saves bandwidth<br>✅ Standard API | ⚠️ Need to modify client | All cases |
| **Request ID** | ✅ Simple<br>✅ No client changes | ❌ Doesn't cancel request<br>❌ Wastes bandwidth | Simple cases |
| **Debouncing** | ✅ Prevents rapid requests<br>✅ Better UX | ❌ Delays search<br>❌ Doesn't handle clicks | Typing scenarios |
| **Combined** | ✅ Best UX<br>✅ Handles all cases | ⚠️ More complex | Production apps |

## Recommendation

**Use Combined Approach:**

1. **Debouncing** for typing (300ms delay)
2. **AbortController** for cancellation
3. **Request ID** as backup protection

This gives you:
- ✅ No wasted requests while typing
- ✅ Cancelled network requests (saves bandwidth)
- ✅ Protection against race conditions
- ✅ Best user experience

## Implementation Checklist

- [ ] Add AbortController support to BaseClient
- [ ] Update search methods to accept AbortSignal
- [ ] Create useDebounce hook
- [ ] Create useCompanySearch hook with cancellation
- [ ] Update components to use debounced search
- [ ] Test race condition scenarios
- [ ] Test cancellation scenarios
