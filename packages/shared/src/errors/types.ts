/**
 * Error codes for different error types
 */
export enum ErrorCode {
  // Validation errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  
  // Not found errors (404)
  NOT_FOUND = 'NOT_FOUND',
  
  // Conflict errors (409)
  CONFLICT = 'CONFLICT',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  
  // Database errors (500/503)
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_CONNECTION_ERROR = 'DATABASE_CONNECTION_ERROR',
  
  // External service errors (502/503/504)
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // Authentication/Authorization errors (401/403)
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  
  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Internal errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Field-level validation error
 */
export interface FieldValidationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Structured error response
 */
export interface StructuredError {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  fields?: FieldValidationError[]; // Field-level validation errors (for ValidationError)
  statusCode: number;
  originalError?: {
    type: string;
    message: string;
    code?: string;
  };
}

// Note: ApiResponse is defined in ../types/index.ts to avoid circular dependencies
