import { withRetry } from '@crm/shared';

/**
 * Base HTTP client with common functionality
 * Includes retry logic and request logging
 */
export abstract class BaseClient {
  protected baseUrl: string;
  protected enableLogging: boolean;

  constructor() {
    this.baseUrl = process.env.API_BASE_URL || 'http://localhost:4000';
    this.enableLogging = process.env.HTTP_CLIENT_LOGGING === 'true';
  }

  /**
   * Log HTTP request
   */
  protected log(method: string, path: string, status?: number, duration?: number) {
    if (!this.enableLogging) return;

    const message = status
      ? `${method} ${path} - ${status} (${duration}ms)`
      : `${method} ${path}`;

    console.log(`[HTTP Client] ${message}`);
  }

  /**
   * Core request method with retry logic
   */
  protected async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T | null> {
    const startTime = Date.now();
    const method = options.method || 'GET';

    return withRetry<T | null>(
      async (): Promise<T | null> => {
        const response = await fetch(`${this.baseUrl}${path}`, options);
        const duration = Date.now() - startTime;

        this.log(method, path, response.status, duration);

        if (!response.ok) {
          if (response.status === 404) return null;

          const error: any = new Error(`${method} ${path} failed: ${response.statusText}`);
          error.status = response.status;
          error.response = response;
          throw error;
        }

        // Handle 204 No Content
        if (response.status === 204) return null;

        return (await response.json()) as T;
      },
      {
        maxRetries: 3,
        shouldRetry: (error: any) => {
          // Retry on 429 (rate limit), 502/503/504 (server errors), or network errors
          const status = error?.status;
          return status === 429 || status === 502 || status === 503 || status === 504;
        },
        onRetry: (attempt, error) => {
          console.warn(`[HTTP Client] Retrying ${method} ${path} (attempt ${attempt + 1})`, error.message);
        },
      }
    );
  }

  /**
   * Helper for GET requests
   */
  protected async get<T>(path: string): Promise<T | null> {
    return this.request<T>(path, { method: 'GET' });
  }

  /**
   * Helper for POST requests
   */
  protected async post<T>(path: string, body: any): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as Promise<T>;
  }

  /**
   * Helper for PATCH requests
   */
  protected async patch<T>(path: string, body: any): Promise<T | void> {
    return this.request<T>(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as Promise<T | void>;
  }

  /**
   * Helper for PUT requests
   */
  protected async put<T>(path: string, body: any): Promise<T | void> {
    return this.request<T>(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as Promise<T | void>;
  }

  /**
   * Helper for DELETE requests
   */
  protected async delete<T>(path: string): Promise<T | void> {
    return this.request<T>(path, { method: 'DELETE' }) as Promise<T | void>;
  }
}
