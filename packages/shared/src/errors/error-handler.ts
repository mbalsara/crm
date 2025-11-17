import { 
  AppError, 
  InternalError, 
  DatabaseError, 
  ValidationError, 
  NotFoundError, 
  ConflictError, 
  DuplicateEntryError,
  RateLimitError,
  ExternalServiceError
} from './base-errors';
import type { StructuredError } from './types';

/**
 * Convert any error to a structured AppError
 */
export function normalizeError(error: unknown): AppError {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // Zod validation errors - map to field-level errors
  if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
    const zodError = error as any;
    const fields: Array<{ field: string; message: string; code?: string }> = [];
    
    if (zodError.errors && Array.isArray(zodError.errors)) {
      zodError.errors.forEach((err: any) => {
        const field = err.path.join('.');
        fields.push({
          field,
          message: err.message,
          code: err.code, // Zod error code (e.g., 'invalid_type', 'too_small', etc.)
        });
      });
    }
    
    return new ValidationError(
      'Validation failed',
      { errorCount: fields.length },
      fields
    );
  }

    // Database errors (PostgresError, etc.)
    if (error && typeof error === 'object' && 'code' in error) {
      const dbError = error as any;
      const code = dbError.code;

      // PostgreSQL error codes
      if (code === '42P01') {
        // Table does not exist
        const originalError = error instanceof Error ? error : new Error(String(error));
        return new DatabaseError(
          `Database table does not exist: ${dbError.message}`,
          { table: dbError.table, code },
          originalError
        );
      }
      
      if (code === '23503') {
        // Foreign key violation
        return new ValidationError(
          `Foreign key violation: ${dbError.detail || dbError.message}`,
          { constraint: dbError.constraint, code }
        );
      }
      
      if (code === '23505') {
        // Unique constraint violation
        const detail = dbError.detail || '';
        const match = detail.match(/Key \(([^)]+)\)=\(([^)]+)\)/);
        if (match) {
          const [, field, value] = match;
          return new DuplicateEntryError('Resource', field, value);
        }
        return new ConflictError(
          `Duplicate entry: ${detail || dbError.message}`,
          { constraint: dbError.constraint, code }
        );
      }
      
      if (code === '23502') {
        // Not null violation
        return new ValidationError(
          `Required field missing: ${dbError.column || 'unknown'}`,
          { column: dbError.column, code }
        );
      }

      // Other database errors
      if (typeof code === 'string' && (code.startsWith('23') || code.startsWith('42'))) {
        const originalError = error instanceof Error ? error : new Error(String(error));
        return new DatabaseError(
          dbError.message || 'Database error occurred',
          { code },
          originalError
        );
      }
    }

  // HTTP errors from fetch
  if (error && typeof error === 'object' && 'status' in error) {
    const httpError = error as any;
    const status = httpError.status;

    if (status === 404) {
      return new NotFoundError('Resource');
    }
    
    if (status === 409) {
      return new ConflictError(httpError.message || 'Conflict occurred');
    }
    
    if (status === 429) {
      const retryAfter = httpError.retryAfter 
        ? parseInt(httpError.retryAfter, 10)
        : undefined;
      return new RateLimitError(
        httpError.message || 'Rate limit exceeded',
        retryAfter
      );
    }
    
    if (status >= 500) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      return new ExternalServiceError(
        'External service',
        httpError.message || `External service error: ${status}`,
        status,
        originalError
      );
    }
  }

  // Generic Error
  if (error instanceof Error) {
    return new InternalError(
      error.message || 'An unexpected error occurred',
      undefined,
      error
    );
  }

  // Unknown error type - convert to Error
  const errorMessage = error && typeof error === 'object' && 'message' in error
    ? String((error as any).message)
    : String(error);
  const originalError = new Error(errorMessage);
  
  return new InternalError(
    'An unexpected error occurred',
    { originalError: String(error) },
    originalError
  );
}

/**
 * Convert error to structured error response
 */
export function toStructuredError(error: unknown): StructuredError {
  const appError = normalizeError(error);
  return appError.toStructuredError();
}
