/**
 * Example component demonstrating company search with debouncing and cancellation
 * 
 * Features:
 * - Debounced search (waits 300ms after user stops typing)
 * - Automatic request cancellation
 * - Loading and error states
 * - Pagination
 */
import { useState, useEffect } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { useCompanySearch } from '../hooks/useCompanySearch';
import { SearchOperator } from '@crm/shared';
import type { SearchRequest } from '@crm/shared';

export function CompanySearchExample() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Debounce search term (wait 300ms after user stops typing)
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  const { search, loading, error, results } = useCompanySearch();

  // Search when debounced term or filter changes
  useEffect(() => {
    const queries: SearchRequest['queries'] = [];
    
    // Add name search if term exists
    if (debouncedSearchTerm) {
      queries.push({
        field: 'name',
        operator: SearchOperator.LIKE,
        value: `%${debouncedSearchTerm}%`,
      });
    }
    
    // Add status filter if selected
    if (statusFilter) {
      queries.push({
        field: 'status',
        operator: SearchOperator.EQUALS,
        value: statusFilter,
      });
    }

    // Only search if we have at least one query
    if (queries.length > 0) {
      search({
        queries,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        limit: pageSize,
        offset: page * pageSize,
      });
    } else {
      // Clear results if no search criteria
      setPage(0);
    }
  }, [debouncedSearchTerm, statusFilter, page, search]);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Company Search</h2>
      
      {/* Search Input */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(0); // Reset to first page when search changes
          }}
          placeholder="Search companies..."
          style={{
            padding: '8px',
            fontSize: '16px',
            width: '300px',
            marginRight: '10px',
          }}
        />
        
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0); // Reset to first page when filter changes
          }}
          style={{
            padding: '8px',
            fontSize: '16px',
          }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ padding: '10px', color: '#666' }}>
          Searching...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{ padding: '10px', color: 'red' }}>
          Error: {error.message}
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <div>
          <p style={{ marginBottom: '10px' }}>
            Found {results.total} companies
          </p>
          
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {results.items.map((company) => (
              <li
                key={company.id}
                style={{
                  padding: '10px',
                  marginBottom: '5px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                }}
              >
                <strong>{company.name}</strong>
                {company.domains && company.domains.length > 0 && (
                  <div style={{ color: '#666', fontSize: '14px' }}>
                    {company.domains.join(', ')}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {results.total > pageSize && (
            <div style={{ marginTop: '20px' }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                style={{
                  padding: '8px 16px',
                  marginRight: '10px',
                  cursor: page === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>
              
              <span style={{ margin: '0 10px' }}>
                Page {page + 1} of {Math.ceil(results.total / pageSize)}
              </span>
              
              <button
                disabled={(page + 1) * pageSize >= results.total}
                onClick={() => setPage(page + 1)}
                style={{
                  padding: '8px 16px',
                  cursor: (page + 1) * pageSize >= results.total ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && results && results.items.length === 0 && (
        <div style={{ padding: '20px', color: '#666' }}>
          No companies found
        </div>
      )}
    </div>
  );
}
