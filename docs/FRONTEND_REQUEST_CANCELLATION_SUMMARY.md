# Request Cancellation - Quick Summary

## The Problem

When users type fast or click multiple times, older AJAX requests can overwrite newer results:

```
User types "acme" → 4 requests sent
Request 4 (fast) completes → Shows "acme" ✅
Request 3 (slow) completes → Overwrites with "acm" ❌
Request 2 (slow) completes → Overwrites with "ac" ❌
```

## Solution: AbortController + Debouncing

### 1. Add AbortController to Client

```typescript
// packages/clients/src/base-client.ts
protected async request<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal  // Add this
): Promise<T | null> {
  const response = await fetch(fullUrl, {
    ...options,
    signal, // Attach abort signal
  });
  // ... rest of code
}
```

### 2. Update Search Method

```typescript
// packages/clients/src/company/client.ts
async search(
  request: SearchRequest,
  signal?: AbortSignal  // Add this
): Promise<SearchResponse<Company>> {
  const response = await this.post<ApiResponse<SearchResponse<Company>>>(
    '/api/companies/search',
    request,
    signal  // Pass signal
  );
  return response.data;
}
```

### 3. React Hook with Cancellation

```typescript
// hooks/useCompanySearch.ts
export function useCompanySearch() {
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = async (request: SearchRequest) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const data = await client.search(request, controller.signal);
      if (!controller.signal.aborted) {
        setResults(data);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err);
      }
    }
  };

  return { search, loading, error, results };
}
```

### 4. Add Debouncing

```typescript
// hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debounced;
}

// Usage
const debouncedTerm = useDebounce(searchTerm, 300);
useEffect(() => {
  if (debouncedTerm) {
    search({ queries: [...] });
  }
}, [debouncedTerm]);
```

## Result

✅ Older requests are cancelled (saves bandwidth)
✅ Only latest results are shown
✅ No race conditions
✅ Better UX (debouncing prevents spam)

## Quick Implementation

1. **Add `signal?: AbortSignal` to BaseClient.request()**
2. **Pass signal to fetch()**
3. **Update search methods to accept signal**
4. **Use AbortController in React hooks**
5. **Add debouncing for typing**

See `docs/FRONTEND_REQUEST_CANCELLATION.md` for full details.
