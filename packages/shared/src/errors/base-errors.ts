import { ErrorCode } from './types';

/**
 * Base error class for all application errors
 */
export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly statusCode: number;
  readonly details?: Record<string, any>;
  readonly originalError?: Error;

  constructor(
    message: string,
    details?: Record<string, any>,
    originalError?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    this.originalError = originalError;
    
    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to structured error format
   */
  toStructuredError() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      statusCode: this.statusCode,
      originalError: this.originalError
        ? {
            type: this.originalError.constructor.name,
            message: this.originalError.message,
            code: (this.originalError as any).code,
          }
        : undefined,
    };
  }
}

/**
 * Validation errors (400) - Client error, don't retry
 */
export class ValidationError extends AppError {
  readonly code = ErrorCode.VALIDATION_ERROR;
  readonly statusCode = 400;
  readonly fields?: Array<{ field: string; message: string; code?: string }>;

  constructor(
    message: string,
    details?: Record<string, any>,
    fields?: Array<{ field: string; message: string; code?: string }>
  ) {
    super(message, details);
    this.fields = fields;
  }

  toStructuredError() {
    const base = super.toStructuredError();
    return {
      ...base,
      fields: this.fields,
    };
  }
}

/**
 * Invalid input errors (400) - Client error, don't retry
 */
export class InvalidInputError extends AppError {
  readonly code = ErrorCode.INVALID_INPUT;
  readonly statusCode = 400;

  constructor(message: string, details?: Record<string, any>) {
    super(message, details);
  }
}

/**
 * Not found errors (404) - Client error, don't retry
 */
export class NotFoundError extends AppError {
  readonly code = ErrorCode.NOT_FOUND;
  readonly statusCode = 404;

  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, { resource, identifier });
  }
}

/**
 * Conflict errors (409) - Client error, don't retry
 */
export class ConflictError extends AppError {
  readonly code = ErrorCode.CONFLICT;
  readonly statusCode = 409;

  constructor(message: string, details?: Record<string, any>) {
    super(message, details);
  }
}

/**
 * Duplicate entry errors (409) - Client error, don't retry
 */
export class DuplicateEntryError extends AppError {
  readonly code = ErrorCode.DUPLICATE_ENTRY;
  readonly statusCode = 409;

  constructor(resource: string, field: string, value: string) {
    const message = `${resource} with ${field} '${value}' already exists`;
    super(message, { resource, field, value });
  }
}

/**
 * Database errors (500/503) - System error, might retry
 */
export class DatabaseError extends AppError {
  readonly code = ErrorCode.DATABASE_ERROR;
  readonly statusCode: number;

  constructor(message: string, details?: Record<string, any>, originalError?: Error) {
    super(message, details, originalError);
    
    // Check if it's a connection error (503)
    if (originalError && this.isConnectionError(originalError)) {
      this.statusCode = 503;
    } else {
      this.statusCode = 500;
    }
  }

  private isConnectionError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    );
  }
}

/**
 * Database connection errors (503) - System error, retry
 */
export class DatabaseConnectionError extends AppError {
  readonly code = ErrorCode.DATABASE_CONNECTION_ERROR;
  readonly statusCode = 503;

  constructor(message: string, originalError?: Error) {
    super(message, undefined, originalError);
  }
}

/**
 * External service errors (502/503/504) - System error, retry
 */
export class ExternalServiceError extends AppError {
  readonly code = ErrorCode.EXTERNAL_SERVICE_ERROR;
  readonly statusCode: number;

  constructor(
    service: string,
    message: string,
    statusCode?: number,
    originalError?: Error
  ) {
    super(message, { service }, originalError);
    
    // Map HTTP status codes
    if (statusCode === 503) {
      this.statusCode = 503;
    } else if (statusCode === 504) {
      this.statusCode = 504;
    } else {
      this.statusCode = statusCode || 502;
    }
  }
}

/**
 * Service unavailable errors (503) - System error, retry
 */
export class ServiceUnavailableError extends AppError {
  readonly code = ErrorCode.SERVICE_UNAVAILABLE;
  readonly statusCode = 503;

  constructor(service: string, message?: string) {
    super(message || `${service} is currently unavailable`, { service });
  }
}

/**
 * Unauthorized errors (401) - Client error, don't retry
 */
export class UnauthorizedError extends AppError {
  readonly code = ErrorCode.UNAUTHORIZED;
  readonly statusCode = 401;

  constructor(message: string = 'Unauthorized') {
    super(message);
  }
}

/**
 * Forbidden errors (403) - Client error, don't retry
 */
export class ForbiddenError extends AppError {
  readonly code = ErrorCode.FORBIDDEN;
  readonly statusCode = 403;

  constructor(message: string = 'Forbidden') {
    super(message);
  }
}

/**
 * Rate limit errors (429) - Client error, retry after delay
 */
export class RateLimitError extends AppError {
  readonly code = ErrorCode.RATE_LIMIT_EXCEEDED;
  readonly statusCode = 429;
  readonly retryAfter?: number; // seconds

  constructor(message: string, retryAfter?: number) {
    super(message, { retryAfter });
    this.retryAfter = retryAfter;
  }
}

/**
 * Internal errors (500) - System error, might retry
 */
export class InternalError extends AppError {
  readonly code = ErrorCode.INTERNAL_ERROR;
  readonly statusCode = 500;

  constructor(message: string, details?: Record<string, any>, originalError?: Error) {
    super(message, details, originalError);
  }
}
