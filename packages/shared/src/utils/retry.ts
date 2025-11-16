/**
 * Retry wrapper with exponential backoff
 *
 * @param operation - The async operation to retry
 * @param options - Retry options
 * @returns The result of the operation
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    shouldRetry?: (error: any) => boolean;
    backoffMs?: (attempt: number) => number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 5;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
  const backoffMs = options.backoffMs ?? defaultBackoff;
  const onRetry = options.onRetry ?? (() => {});

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      if (!shouldRetry(error) || attempt === maxRetries) {
        throw error;
      }

      const delayMs = backoffMs(attempt);
      onRetry(attempt, error);

      await sleep(delayMs);
    }
  }

  throw new Error('Unexpected retry loop exit');
}

/**
 * Default retry logic: retry on rate limit (429) or quota exceeded (403)
 */
function defaultShouldRetry(error: any): boolean {
  const statusCode = error?.code || error?.response?.status;
  return statusCode === 429 || statusCode === 403;
}

/**
 * Default backoff: exponential backoff with max of 32 seconds
 */
function defaultBackoff(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 32000);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
