import { useState, useRef, useCallback, useEffect } from 'react';
import { ContactClient } from '@crm/clients';
import type { SearchRequest, SearchResponse } from '@crm/shared';
import type { Contact } from '@crm/clients';

const client = new ContactClient();

/**
 * Hook for searching contacts with automatic request cancellation
 * 
 * Features:
 * - Cancels previous requests when new search starts
 * - Prevents race conditions
 * - Tracks loading and error states
 * 
 * @example
 * ```tsx
 * const { search, loading, error, results } = useContactSearch();
 * 
 * const handleSearch = () => {
 *   search({
 *     queries: [
 *       { field: 'email', operator: 'like', value: '%@example.com' }
 *     ],
 *     limit: 20
 *   });
 * };
 * ```
 */
export function useContactSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [results, setResults] = useState<SearchResponse<Contact> | null>(null);
  
  // Track request ID for race condition protection
  const requestIdRef = useRef(0);
  
  // AbortController for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async (request: SearchRequest) => {
    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Increment request ID to track request order
    const currentRequestId = ++requestIdRef.current;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await client.search(request, abortController.signal);
      
      // Check if request was aborted (shouldn't happen here, but safety check)
      if (abortController.signal.aborted) {
        return;
      }
      
      // Only update state if this is still the latest request
      // This prevents race conditions where older requests complete after newer ones
      if (currentRequestId === requestIdRef.current) {
        setResults(data);
      }
    } catch (err: any) {
      // Ignore abort errors (expected when cancelling)
      if (err.name === 'AbortError' || err.message === 'Request was cancelled') {
        return;
      }
      
      // Only set error if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setError(err instanceof Error ? err : new Error('Search failed'));
      }
    } finally {
      // Only update loading state if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Cleanup: cancel any pending requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { search, loading, error, results };
}
