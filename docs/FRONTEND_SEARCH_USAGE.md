# Frontend Search Query Usage

## Overview

This document explains how frontend applications construct and send search queries to the API.

## Client Package Integration

### 1. Add Search Method to Client

```typescript
// packages/clients/src/company/client.ts
import { BaseClient } from '../base-client';
import type { ApiResponse, SearchRequest, SearchResponse } from '@crm/shared';
import type { Company, CreateCompanyRequest } from './types';

export class CompanyClient extends BaseClient {
  // ... existing methods ...

  /**
   * Search companies
   */
  async search(request: SearchRequest): Promise<SearchResponse<Company>> {
    const response = await this.post<ApiResponse<SearchResponse<Company>>>(
      '/api/companies/search',
      request
    );
    
    if (!response?.data) {
      throw new Error('Invalid API response: missing data');
    }
    
    return response.data;
  }
}
```

### 2. Export Search Types

```typescript
// packages/clients/src/index.ts
export * from '@crm/shared'; // Exports SearchRequest, SearchResponse, SearchOperator
export * from './company';
export * from './contact';
// ... etc
```

---

## Frontend Usage Examples

### Example 1: Basic Search (Vanilla TypeScript)

```typescript
import { CompanyClient } from '@crm/clients';
import { SearchOperator } from '@crm/shared';
import type { SearchRequest } from '@crm/shared';

const client = new CompanyClient();

// Construct search query
const searchRequest: SearchRequest = {
  queries: [
    {
      field: 'status',
      operator: SearchOperator.EQUALS,
      value: 'active',
    },
  ],
  limit: 20,
  offset: 0,
};

// Execute search
const results = await client.search(searchRequest);
console.log(results.items); // Array of companies
console.log(results.total); // Total count
```

### Example 2: Multiple Filters

```typescript
import { CompanyClient } from '@crm/clients';
import { SearchOperator } from '@crm/shared';

const client = new CompanyClient();

const searchRequest = {
  queries: [
    { field: 'status', operator: SearchOperator.EQUALS, value: 'active' },
    { field: 'name', operator: SearchOperator.LIKE, value: '%tech%' },
    { field: 'createdAt', operator: SearchOperator.GREATER_THAN_OR_EQUAL, value: '2024-01-01' },
  ],
  sortBy: 'createdAt',
  sortOrder: 'desc' as const,
  limit: 50,
  offset: 0,
};

const results = await client.search(searchRequest);
```

### Example 3: React Hook

```typescript
// hooks/useCompanySearch.ts
import { useState, useEffect } from 'react';
import { CompanyClient } from '@crm/clients';
import { SearchOperator } from '@crm/shared';
import type { SearchRequest, SearchResponse } from '@crm/shared';
import type { Company } from '@crm/clients';

const client = new CompanyClient();

export function useCompanySearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [results, setResults] = useState<SearchResponse<Company> | null>(null);

  const search = async (request: SearchRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await client.search(request);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Search failed'));
    } finally {
      setLoading(false);
    }
  };

  return { search, loading, error, results };
}
```

### Example 4: React Component with Search Form

```typescript
// components/CompanySearch.tsx
import { useState } from 'react';
import { useCompanySearch } from '../hooks/useCompanySearch';
import { SearchOperator } from '@crm/shared';
import type { SearchRequest } from '@crm/shared';

export function CompanySearch() {
  const { search, loading, error, results } = useCompanySearch();
  
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [nameFilter, setNameFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const handleSearch = () => {
    const queries: SearchRequest['queries'] = [];
    
    // Add status filter
    if (statusFilter) {
      queries.push({
        field: 'status',
        operator: SearchOperator.EQUALS,
        value: statusFilter,
      });
    }
    
    // Add name filter
    if (nameFilter) {
      queries.push({
        field: 'name',
        operator: SearchOperator.LIKE,
        value: `%${nameFilter}%`,
      });
    }
    
    // Build search request
    const searchRequest: SearchRequest = {
      queries,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      limit: pageSize,
      offset: page * pageSize,
    };
    
    search(searchRequest);
  };

  return (
    <div>
      <div>
        <input
          type="text"
          placeholder="Company name"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button onClick={handleSearch} disabled={loading}>
          Search
        </button>
      </div>

      {loading && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}
      
      {results && (
        <div>
          <p>Found {results.total} companies</p>
          <ul>
            {results.items.map((company) => (
              <li key={company.id}>{company.name}</li>
            ))}
          </ul>
          
          {/* Pagination */}
          <div>
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              disabled={(page + 1) * pageSize >= results.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Query Builder Utilities

### Helper Function: Build Search Query

```typescript
// utils/search-query-builder.ts
import { SearchOperator, type SearchQuery } from '@crm/shared';

export class SearchQueryBuilder {
  private queries: SearchQuery[] = [];

  /**
   * Add equals condition
   */
  equals(field: string, value: string | number | boolean): this {
    this.queries.push({
      field,
      operator: SearchOperator.EQUALS,
      value,
    });
    return this;
  }

  /**
   * Add not equals condition
   */
  notEquals(field: string, value: string | number | boolean): this {
    this.queries.push({
      field,
      operator: SearchOperator.NOT_EQUALS,
      value,
    });
    return this;
  }

  /**
   * Add like condition (pattern matching)
   */
  like(field: string, pattern: string): this {
    this.queries.push({
      field,
      operator: SearchOperator.LIKE,
      value: pattern,
    });
    return this;
  }

  /**
   * Add greater than condition
   */
  greaterThan(field: string, value: number | string): this {
    this.queries.push({
      field,
      operator: SearchOperator.GREATER_THAN,
      value,
    });
    return this;
  }

  /**
   * Add greater than or equal condition
   */
  greaterThanOrEqual(field: string, value: number | string): this {
    this.queries.push({
      field,
      operator: SearchOperator.GREATER_THAN_OR_EQUAL,
      value,
    });
    return this;
  }

  /**
   * Add less than condition
   */
  lessThan(field: string, value: number | string): this {
    this.queries.push({
      field,
      operator: SearchOperator.LESS_THAN,
      value,
    });
    return this;
  }

  /**
   * Add less than or equal condition
   */
  lessThanOrEqual(field: string, value: number | string): this {
    this.queries.push({
      field,
      operator: SearchOperator.LESS_THAN_OR_EQUAL,
      value,
    });
    return this;
  }

  /**
   * Add in condition (array membership)
   */
  in(field: string, values: (string | number | boolean)[]): this {
    this.queries.push({
      field,
      operator: SearchOperator.IN,
      value: values,
    });
    return this;
  }

  /**
   * Add not in condition
   */
  notIn(field: string, values: (string | number | boolean)[]): this {
    this.queries.push({
      field,
      operator: SearchOperator.NOT_IN,
      value: values,
    });
    return this;
  }

  /**
   * Build the search request
   */
  build(options?: {
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): SearchRequest {
    return {
      queries: this.queries,
      sortBy: options?.sortBy,
      sortOrder: options?.sortOrder || 'asc',
      limit: options?.limit || 20,
      offset: options?.offset || 0,
    };
  }

  /**
   * Reset builder
   */
  reset(): this {
    this.queries = [];
    return this;
  }
}
```

### Usage of Query Builder

```typescript
import { SearchQueryBuilder } from '../utils/search-query-builder';
import { CompanyClient } from '@crm/clients';

const client = new CompanyClient();
const builder = new SearchQueryBuilder();

// Build query fluently
const searchRequest = builder
  .equals('status', 'active')
  .like('name', '%tech%')
  .greaterThanOrEqual('createdAt', '2024-01-01')
  .build({
    sortBy: 'createdAt',
    sortOrder: 'desc',
    limit: 50,
  });

// Execute search
const results = await client.search(searchRequest);
```

---

## Advanced: Form-Based Search Builder

```typescript
// hooks/useSearchForm.ts
import { useState, useCallback } from 'react';
import { SearchQueryBuilder, SearchOperator } from '@crm/shared';
import type { SearchRequest } from '@crm/shared';

interface SearchFilters {
  status?: string;
  name?: string;
  industry?: string;
  createdAfter?: string;
  createdBefore?: string;
}

export function useSearchForm() {
  const [filters, setFilters] = useState<SearchFilters>({});
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const buildSearchRequest = useCallback((): SearchRequest => {
    const builder = new SearchQueryBuilder();

    // Add filters
    if (filters.status) {
      builder.equals('status', filters.status);
    }
    
    if (filters.name) {
      builder.like('name', `%${filters.name}%`);
    }
    
    if (filters.industry) {
      builder.equals('industry', filters.industry);
    }
    
    if (filters.createdAfter) {
      builder.greaterThanOrEqual('createdAt', filters.createdAfter);
    }
    
    if (filters.createdBefore) {
      builder.lessThanOrEqual('createdAt', filters.createdBefore);
    }

    return builder.build({
      sortBy,
      sortOrder,
      limit: pageSize,
      offset: page * pageSize,
    });
  }, [filters, sortBy, sortOrder, page]);

  return {
    filters,
    setFilters,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    page,
    setPage,
    pageSize,
    buildSearchRequest,
  };
}
```

---

## HTTP Request Flow

### What Actually Gets Sent

```typescript
// Frontend constructs:
const searchRequest = {
  queries: [
    { field: 'status', operator: 'eq', value: 'active' },
    { field: 'name', operator: 'like', value: '%tech%' },
  ],
  sortBy: 'createdAt',
  sortOrder: 'desc',
  limit: 20,
  offset: 0,
};

// Client sends HTTP POST:
POST /api/companies/search
Headers:
  Authorization: Bearer <JWT_TOKEN>
  Content-Type: application/json
Body:
{
  "queries": [
    { "field": "status", "operator": "eq", "value": "active" },
    { "field": "name", "operator": "like", "value": "%tech%" }
  ],
  "sortBy": "createdAt",
  "sortOrder": "desc",
  "limit": 20,
  "offset": 0
}

// API returns:
{
  "success": true,
  "data": {
    "items": [/* array of companies */],
    "total": 150,
    "limit": 20,
    "offset": 0
  }
}
```

---

## TypeScript Type Safety

### Full Type Safety Example

```typescript
import { CompanyClient } from '@crm/clients';
import { SearchOperator } from '@crm/shared';
import type { SearchRequest, SearchResponse } from '@crm/shared';
import type { Company } from '@crm/clients';

const client = new CompanyClient();

// TypeScript ensures correct types
const searchRequest: SearchRequest = {
  queries: [
    {
      field: 'status',                    // ✅ Type checked
      operator: SearchOperator.EQUALS,     // ✅ Enum type
      value: 'active',                     // ✅ Union type
    },
  ],
  sortBy: 'createdAt',                    // ✅ String
  sortOrder: 'desc',                       // ✅ 'asc' | 'desc'
  limit: 20,                               // ✅ number
  offset: 0,                              // ✅ number
};

// Response is fully typed
const results: SearchResponse<Company> = await client.search(searchRequest);

// TypeScript knows the structure
results.items.forEach((company: Company) => {
  console.log(company.name);  // ✅ TypeScript knows Company has 'name'
  console.log(company.id);    // ✅ TypeScript knows Company has 'id'
});
```

---

## Common Patterns

### Pattern 1: Search with Debouncing

```typescript
import { useState, useEffect } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { CompanyClient } from '@crm/clients';
import { SearchOperator } from '@crm/shared';

export function CompanySearchWithDebounce() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const client = new CompanyClient();

  useEffect(() => {
    if (!debouncedSearchTerm) return;

    const searchRequest = {
      queries: [
        {
          field: 'name',
          operator: SearchOperator.LIKE,
          value: `%${debouncedSearchTerm}%`,
        },
      ],
      limit: 20,
      offset: 0,
    };

    client.search(searchRequest).then((results) => {
      console.log('Results:', results);
    });
  }, [debouncedSearchTerm]);

  return (
    <input
      type="text"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search companies..."
    />
  );
}
```

### Pattern 2: URL-Based Search (Shareable Links)

```typescript
import { useSearchParams } from 'react-router-dom';
import { CompanyClient } from '@crm/clients';
import { SearchOperator } from '@crm/shared';

export function CompanySearchWithURL() {
  const [searchParams, setSearchParams] = useSearchParams();
  const client = new CompanyClient();

  // Read from URL
  const status = searchParams.get('status') || '';
  const name = searchParams.get('name') || '';
  const page = parseInt(searchParams.get('page') || '0');

  // Build search from URL params
  const buildSearchRequest = () => {
    const queries = [];
    
    if (status) {
      queries.push({
        field: 'status',
        operator: SearchOperator.EQUALS,
        value: status,
      });
    }
    
    if (name) {
      queries.push({
        field: 'name',
        operator: SearchOperator.LIKE,
        value: `%${name}%`,
      });
    }

    return {
      queries,
      limit: 20,
      offset: page * 20,
    };
  };

  // Update URL when filters change
  const updateFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  return (
    <div>
      <input
        value={name}
        onChange={(e) => updateFilter('name', e.target.value)}
        placeholder="Company name"
      />
      <select
        value={status}
        onChange={(e) => updateFilter('status', e.target.value)}
      >
        <option value="">All</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>
  );
}
```

---

## Summary

1. **Client Method**: Add `search()` method to resource clients
2. **Query Construction**: Build `SearchRequest` object with queries array
3. **Type Safety**: Use TypeScript types and enums (`SearchOperator`)
4. **Helpers**: Use query builder utilities for complex queries
5. **HTTP**: Client sends POST request with JSON body
6. **Response**: Extract `data.items` and `data.total` from response

The frontend constructs a simple JavaScript object and the client package handles the HTTP request/response parsing automatically.
