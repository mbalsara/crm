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
  protected log(method: string, path: string, status?: number, duration?: number, extra?: any) {
    if (!this.enableLogging) return;

    const message = status
      ? `${method} ${path} - ${status} (${duration}ms)`
      : `${method} ${path}`;

    console.log(`[HTTP Client] ${message}`);

    if (extra) {
      console.log('[HTTP Client] Extra:', JSON.stringify(extra, null, 2));
    }
  }

  /**
   * Log error with details
   */
  protected logError(method: string, path: string, error: any, requestBody?: any) {
    if (!this.enableLogging) return;

    console.error(`[HTTP Client] ERROR: ${method} ${path}`);
    console.error('[HTTP Client] Error message:', error.message);

    if (error.status) {
      console.error('[HTTP Client] HTTP status:', error.status);
    }

    if (requestBody) {
      console.error('[HTTP Client] Request body:', JSON.stringify(requestBody, null, 2));
    }

    if (error.stack) {
      console.error('[HTTP Client] Stack trace:', error.stack);
    }
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
    const requestBody = options.body ? JSON.parse(options.body as string) : undefined;

    // Log request if enabled
    if (this.enableLogging) {
      console.log(`[HTTP Client] → ${method} ${this.baseUrl}${path}`);
      if (requestBody) {
        console.log('[HTTP Client] Request body:', JSON.stringify(requestBody, null, 2));
      }
    }

    return withRetry<T | null>(
      async (): Promise<T | null> => {
        try {
          const response = await fetch(`${this.baseUrl}${path}`, options);
          const duration = Date.now() - startTime;

          this.log(method, path, response.status, duration);

          if (!response.ok) {
            if (response.status === 404) return null;

            // Try to get error response body (could be JSON or text)
            // Clone response to read body without consuming the original
            let errorBody = null;
            let errorBodyParsed = null;
            try {
              const clonedResponse = response.clone();
              const contentType = response.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                errorBodyParsed = await clonedResponse.json();
                errorBody = JSON.stringify(errorBodyParsed);
              } else {
                errorBody = await clonedResponse.text();
              }
              if (this.enableLogging) {
                console.error('[HTTP Client] Error response body:', errorBody);
              }
            } catch (e) {
              // Ignore if we can't read the body
            }

            // Use error message from API response if available
            const errorMessage = (errorBodyParsed && typeof errorBodyParsed === 'object' && 'error' in errorBodyParsed && errorBodyParsed.error)
              ? `${method} ${path} failed: ${String(errorBodyParsed.error)}`
              : `${method} ${path} failed: ${response.statusText}`;

            const error: any = new Error(errorMessage);
            error.status = response.status;
            error.response = response;
            error.responseBody = errorBody;
            error.responseBodyParsed = errorBodyParsed;

            this.logError(method, path, error, requestBody);
            throw error;
          }

          // Handle 204 No Content
          if (response.status === 204) return null;

          const responseData = (await response.json()) as T;

          // Log response if enabled
          if (this.enableLogging) {
            console.log('[HTTP Client] Response:', JSON.stringify(responseData, null, 2));
            console.log('[HTTP Client] Response type:', typeof responseData);
            console.log('[HTTP Client] Response keys:', responseData && typeof responseData === 'object' ? Object.keys(responseData) : 'N/A');
          }

          return responseData;
        } catch (error: any) {
          // Log network errors or JSON parsing errors
          if (!error.status) {
            this.logError(method, path, error, requestBody);
          }
          throw error;
        }
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
    const result = await this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (result === null) {
      throw new Error(`POST ${path} returned null response`);
    }
    return result;
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
