import type { ApiResponse } from '@crm/shared';

export interface RequestOptions extends RequestInit {
  signal?: AbortSignal;
}

// Check if running in browser environment
const isBrowser = typeof globalThis !== 'undefined' && 'window' in globalThis;

/**
 * Base HTTP client with session token management
 * Supports both browser (cookies) and API clients (Authorization header)
 */
export class BaseClient {
  protected baseUrl: string;

  private sessionToken: string | null = null;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl || (isBrowser ? '' : 'http://localhost:4001');
  }

  /**
   * Set session token (for API clients)
   * Browser clients use cookies automatically
   */
  setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  /**
   * Get current session token
   */
  getSessionToken(): string | null {
    return this.sessionToken;
  }

  /**
   * Make HTTP request with session token management
   */
  protected async request<T>(url: string, options: RequestOptions = {}): Promise<T> {
    // Make request with session token (if set for API clients)
    let response = await fetch(`${this.baseUrl}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.sessionToken && { Authorization: `Bearer ${this.sessionToken}` }),
        ...options.headers,
      },
      credentials: 'include', // Include cookies for browser clients
      signal: options.signal,
    });

    // Check if session was refreshed (sliding window)
    const refreshedToken = response.headers.get('X-Session-Refreshed');
    if (refreshedToken && this.sessionToken) {
      // Update stored token for API clients
      this.sessionToken = refreshedToken;
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(errorBody.message || `Request failed: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * GET request
   */
  protected async get<T>(url: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(url, { method: 'GET', signal });
  }

  /**
   * POST request
   */
  protected async post<T>(url: string, data?: any, signal?: AbortSignal): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      body: JSON.stringify(data),
      signal,
    });
  }

  /**
   * PATCH request
   */
  protected async patch<T>(url: string, data?: any, signal?: AbortSignal): Promise<T> {
    return this.request<T>(url, {
      method: 'PATCH',
      body: JSON.stringify(data),
      signal,
    });
  }

  /**
   * PUT request
   */
  protected async put<T>(url: string, data?: any, signal?: AbortSignal): Promise<T> {
    return this.request<T>(url, {
      method: 'PUT',
      body: JSON.stringify(data),
      signal,
    });
  }

  /**
   * DELETE request
   */
  protected async delete<T>(url: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(url, { method: 'DELETE', signal });
  }
}
