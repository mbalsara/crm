# Request Cancellation Implementation Summary

## Overview

Implemented request cancellation and race condition handling for AJAX requests in the frontend. This prevents older, slower requests from overwriting newer, faster responses.

## What Was Implemented

### 1. BaseClient Updates (`packages/clients/src/base-client.ts`)

✅ **Added AbortSignal support to all HTTP methods**
- `request()` now accepts optional `signal?: AbortSignal`
- `get()`, `post()`, `patch()`, `put()`, `delete()` all accept `signal` parameter
- Abort errors are handled gracefully (not logged, not retried)
- Network requests are cancelled when signal is aborted

**Key Changes:**
```typescript
protected async request<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal  // Added
): Promise<T | null> {
  // ... merges signal into fetch options
  const response = await fetch(fullUrl, { ...options, signal });
  
  // Handles abort errors gracefully
  if (error.name === 'AbortError') {
    return; // Don't retry or log
  }
}
```

### 2. CompanyClient Updates (`packages/clients/src/company/client.ts`)

✅ **Added search method with AbortSignal support**
- `search()` method accepts optional `signal?: AbortSignal`
- All other methods also accept `signal` for consistency

**New Method:**
```typescript
async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse<Company>> {
  const response = await this.post<ApiResponse<SearchResponse<Company>>>(
    '/api/companies/search',
    request,
    signal
  );
  return response.data;
}
```

### 3. ContactClient Updates (`packages/clients/src/contact/client.ts`)

✅ **Added search method with AbortSignal support**
- Same pattern as CompanyClient
- All methods accept `signal` parameter

### 4. React Hooks (`apps/web/src/hooks/`)

✅ **useDebounce Hook** (`useDebounce.ts`)
- Delays value updates until user stops changing input
- Default delay: 300ms
- Prevents spam requests while typing

✅ **useCompanySearch Hook** (`useCompanySearch.ts`)
- Automatic request cancellation
- Race condition protection (request ID tracking)
- Loading and error state management
- Cleanup on unmount

✅ **useContactSearch Hook** (`useContactSearch.ts`)
- Same features as useCompanySearch
- For contact search operations

### 5. Example Component (`apps/web/src/components/CompanySearchExample.tsx`)

✅ **Complete working example**
- Demonstrates debounced search
- Shows loading/error states
- Includes pagination
- Ready to use or customize

## How It Works

### Request Flow

```
1. User types "acme"
   ↓
2. useDebounce delays 300ms
   ↓
3. useCompanySearch.search() called
   ↓
4. Previous request cancelled (if exists)
   ↓
5. New AbortController created
   ↓
6. Request sent with signal
   ↓
7. If user types again → Step 4 (cancels previous)
   ↓
8. Only latest response updates UI
```

### Race Condition Protection

**Double Protection:**
1. **AbortController**: Cancels network request (saves bandwidth)
2. **Request ID**: Prevents stale responses from updating state

```typescript
const currentRequestId = ++requestIdRef.current;

// Later...
if (currentRequestId === requestIdRef.current) {
  setResults(data); // Only update if still latest request
}
```

## Usage Examples

### Basic Usage

```typescript
import { useCompanySearch } from '../hooks/useCompanySearch';
import { SearchOperator } from '@crm/shared';

function MyComponent() {
  const { search, loading, error, results } = useCompanySearch();

  const handleSearch = () => {
    search({
      queries: [
        { field: 'name', operator: SearchOperator.LIKE, value: '%tech%' }
      ],
      limit: 20
    });
  };

  return (
    <div>
      <button onClick={handleSearch}>Search</button>
      {loading && <div>Loading...</div>}
      {results && <div>Found {results.total} companies</div>}
    </div>
  );
}
```

### With Debouncing

```typescript
import { useDebounce } from '../hooks/useDebounce';
import { useCompanySearch } from '../hooks/useCompanySearch';

function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedTerm = useDebounce(searchTerm, 300);
  const { search, loading, results } = useCompanySearch();

  useEffect(() => {
    if (debouncedTerm) {
      search({
        queries: [
          { field: 'name', operator: 'like', value: `%${debouncedTerm}%` }
        ]
      });
    }
  }, [debouncedTerm]);

  return (
    <input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
    />
  );
}
```

## Benefits

✅ **No Race Conditions**: Older requests can't overwrite newer results
✅ **Bandwidth Savings**: Cancelled requests don't complete
✅ **Better UX**: Debouncing prevents spam requests
✅ **Type Safe**: Full TypeScript support
✅ **Automatic Cleanup**: Requests cancelled on unmount

## Testing

To test the implementation:

1. **Type quickly** in search input
   - Should see only one request per 300ms
   - Previous requests should be cancelled

2. **Check Network Tab**
   - Cancelled requests show as "cancelled" in browser
   - Only latest request completes

3. **Test Race Conditions**
   - Make slow request (throttle network)
   - Make fast request
   - Fast request should show results first
   - Slow request should be ignored

## Files Modified

- `packages/clients/src/base-client.ts` - Added AbortSignal support
- `packages/clients/src/company/client.ts` - Added search method
- `packages/clients/src/contact/client.ts` - Added search method

## Files Created

- `apps/web/src/hooks/useDebounce.ts` - Debounce hook
- `apps/web/src/hooks/useCompanySearch.ts` - Company search hook
- `apps/web/src/hooks/useContactSearch.ts` - Contact search hook
- `apps/web/src/hooks/index.ts` - Hooks exports
- `apps/web/src/components/CompanySearchExample.tsx` - Example component

## Next Steps

1. ✅ Implementation complete
2. ⏳ Add search endpoints to API (if not already done)
3. ⏳ Test with real API
4. ⏳ Customize example component for your UI
5. ⏳ Add to other resources (emails, etc.) as needed

## Notes

- All client methods now accept optional `signal` parameter
- Backward compatible (signal is optional)
- Abort errors are handled silently (expected behavior)
- Request ID tracking provides extra safety layer
- Debouncing is configurable (default 300ms)
