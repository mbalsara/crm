import type { StructuredError } from './types';
import { ErrorCode } from './types';

/**
 * Sanitize error before sending to client
 * Prevents exposing internal system details
 */
export function sanitizeErrorForClient(error: StructuredError): StructuredError {
  // Safe errors - can expose details (validation, not found, etc.)
  const safeErrorCodes = [
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.INVALID_INPUT,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.DUPLICATE_ENTRY,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  ];

  if (safeErrorCodes.includes(error.code)) {
    // Safe to expose - return as-is
    return error;
  }

  // Internal/system errors - sanitize
  return sanitizeInternalError(error);
}

/**
 * Sanitize internal errors - map to generic messages
 */
function sanitizeInternalError(error: StructuredError): StructuredError {
  // Map internal error codes to generic client-facing errors
  const sanitized: StructuredError = {
    code: mapToGenericErrorCode(error.code),
    message: getGenericErrorMessage(error.statusCode),
    statusCode: error.statusCode,
    // Don't expose details or originalError to clients
  };

  return sanitized;
}

/**
 * Map internal error codes to generic error codes
 */
function mapToGenericErrorCode(code: ErrorCode): ErrorCode {
  const internalErrorCodes = [
    ErrorCode.DATABASE_ERROR,
    ErrorCode.DATABASE_CONNECTION_ERROR,
    ErrorCode.EXTERNAL_SERVICE_ERROR,
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.INTERNAL_ERROR,
  ];

  if (internalErrorCodes.includes(code)) {
    // Map all internal errors to generic INTERNAL_ERROR
    return ErrorCode.INTERNAL_ERROR;
  }

  return code;
}

/**
 * Get generic error message based on status code
 */
function getGenericErrorMessage(statusCode: number): string {
  // Map status codes to generic messages
  switch (statusCode) {
    case 500:
      return 'An internal server error occurred. Please try again later.';
    case 502:
    case 503:
    case 504:
      return 'Service temporarily unavailable. Please try again later.';
    default:
      if (statusCode >= 500 && statusCode < 600) {
        return 'An internal server error occurred. Please try again later.';
      }
      return 'An unexpected error occurred. Please try again later.';
  }
}
