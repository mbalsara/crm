# Error Handling System

## Overview

This document describes the structured error handling system used across the CRM platform. The system provides consistent error responses, proper HTTP status codes, and retry guidance for clients.

## Architecture

### Error Types

All errors extend `AppError` base class and include:
- **Error Code**: Enum value identifying error type
- **Status Code**: HTTP status code (400, 404, 409, 500, 503, etc.)
- **Retryable Flag**: Whether the error can be retried
- **Structured Details**: Additional context about the error

### Error Classes

#### Client Errors (Don't Retry)

- **`ValidationError`** (400): Input validation failed
- **`InvalidInputError`** (400): Invalid input format
- **`NotFoundError`** (404): Resource not found
- **`ConflictError`** (409): Resource conflict
- **`DuplicateEntryError`** (409): Unique constraint violation
- **`UnauthorizedError`** (401): Authentication required
- **`ForbiddenError`** (403): Insufficient permissions

#### System Errors (May Retry)

- **`DatabaseError`** (500/503): Database operation failed
- **`DatabaseConnectionError`** (503): Database connection failed
- **`ExternalServiceError`** (502/503/504): External API call failed
- **`ServiceUnavailableError`** (503): Service temporarily unavailable
- **`RateLimitError`** (429): Rate limit exceeded (retry after delay)
- **`InternalError`** (500): Unexpected internal error

## Error Response Format

All API errors follow this structure. **Note**: Internal system errors are sanitized before sending to clients to prevent security leakage.

### Safe Errors (Exposed to Client)
These errors are safe to expose with full details:

```typescript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": { "errorCount": 2 },
    "fields": [
      {
        "field": "tenantId",
        "message": "Invalid uuid",
        "code": "invalid_string"
      }
    ],
    "statusCode": 400
  }
}
```

### Internal Errors (Sanitized for Client)
Internal system errors are sanitized - full details are logged internally but only generic messages are sent to clients:

**What's logged internally:**
```typescript
{
  "code": "DATABASE_ERROR",
  "message": "Database table does not exist: companies",
  "details": { "table": "companies", "code": "42P01" },
  "statusCode": 500,
  "originalError": { ... }
}
```

**What client receives:**
```typescript
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal server error occurred. Please try again later.",
    "statusCode": 500
    // No details or originalError exposed
  }
}
```

### Validation Error (with field-level errors)
```typescript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "errorCount": 2
    },
    "fields": [
      {
        "field": "tenantId",
        "message": "Invalid uuid",
        "code": "invalid_string"
      },
      {
        "field": "domain",
        "message": "String must contain at least 1 character(s)",
        "code": "too_small"
      }
    ],
    "statusCode": 400
  }
}
```

## Usage

### In API Routes

```typescript
import { NotFoundError, ValidationError } from '@crm/shared';
import { errorHandler } from '../middleware/errorHandler';

const routes = new Hono();
routes.use('*', errorHandler); // Apply error handling middleware

routes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const item = await service.getItem(id);
  
  if (!item) {
    throw new NotFoundError('Item', id);
  }
  
  return c.json({ success: true, data: item });
});
```

### Error Normalization

The `normalizeError()` function automatically converts:
- Zod validation errors → `ValidationError`
- Database errors → `DatabaseError` with appropriate status codes
- HTTP errors → Appropriate error types
- Unknown errors → `InternalError`

### In Services

Services can throw `AppError` subclasses directly:

```typescript
import { NotFoundError, DatabaseError } from '@crm/shared';

async getItem(id: string) {
  try {
    return await repository.findById(id);
  } catch (error) {
    if (error.code === '42P01') {
      throw new DatabaseError('Table does not exist', { table: 'items' }, error);
    }
    throw error;
  }
}
```

### In Clients (Analysis Service)

Clients receive structured errors and can check status code for retry decisions:

```typescript
try {
  await apiClient.createCompany(data);
} catch (error: any) {
  const structuredError = error.responseBodyParsed?.error;
  
  // Check status code for retry decisions:
  // - 4xx (400-499): Client errors, don't retry
  // - 5xx (500-599): Server errors, might retry
  // - 429: Rate limit, retry after delay
  if (structuredError?.statusCode >= 500) {
    // Server error - might retry
    logger.warn({ error: structuredError }, 'Server error (might retry)');
  } else if (structuredError?.statusCode === 429) {
    // Rate limit - retry after delay
    logger.warn({ error: structuredError }, 'Rate limit (retry after delay)');
  } else {
    // Client error - don't retry
    logger.error({ error: structuredError }, 'Client error (don\'t retry)');
  }
}
```

## Error Codes Reference

| Code | HTTP Status | Retry Decision | Description |
|------|-------------|----------------|-------------|
| `VALIDATION_ERROR` | 400 | Don't retry | Input validation failed (includes field-level errors) |
| `INVALID_INPUT` | 400 | Don't retry | Invalid input format |
| `NOT_FOUND` | 404 | Don't retry | Resource not found |
| `CONFLICT` | 409 | Don't retry | Resource conflict |
| `DUPLICATE_ENTRY` | 409 | Don't retry | Unique constraint violation |
| `DATABASE_ERROR` | 500/503 | Might retry | Database operation failed |
| `DATABASE_CONNECTION_ERROR` | 503 | Retry | Database connection failed |
| `EXTERNAL_SERVICE_ERROR` | 502/503/504 | Retry | External API call failed |
| `SERVICE_UNAVAILABLE` | 503 | Retry | Service temporarily unavailable |
| `RATE_LIMIT_EXCEEDED` | 429 | Retry after delay | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Don't retry | Unexpected internal error |

**Retry Decision Guidelines:**
- **4xx (400-499)**: Client errors - fix the request, don't retry
- **5xx (500-599)**: Server errors - might be transient, can retry
- **429**: Rate limit - retry after the delay specified in `retryAfter`

## Database Error Mapping

PostgreSQL error codes are automatically mapped:

- `42P01`: Table does not exist → `DatabaseError` (500)
- `23503`: Foreign key violation → `ValidationError` (400)
- `23505`: Unique constraint violation → `DuplicateEntryError` (409)
- `23502`: Not null violation → `ValidationError` (400)
- Connection errors → `DatabaseConnectionError` (503)

## Security: Error Sanitization

**Internal errors are automatically sanitized** before sending to clients to prevent security leakage:

### Safe Errors (Exposed)
- `VALIDATION_ERROR` - Field-level validation details
- `INVALID_INPUT` - Input format errors
- `NOT_FOUND` - Resource not found
- `CONFLICT` / `DUPLICATE_ENTRY` - Conflict details
- `UNAUTHORIZED` / `FORBIDDEN` - Auth errors
- `RATE_LIMIT_EXCEEDED` - Rate limit info

### Sanitized Errors (Generic Messages Only)
- `DATABASE_ERROR` → Generic "Internal server error"
- `DATABASE_CONNECTION_ERROR` → Generic "Service unavailable"
- `EXTERNAL_SERVICE_ERROR` → Generic "Service unavailable"
- `SERVICE_UNAVAILABLE` → Generic "Service unavailable"
- `INTERNAL_ERROR` → Generic "Internal server error"

**Full error details are logged internally** for debugging, but clients only receive generic messages.

## Best Practices

1. **Throw specific errors**: Use the most specific error class
2. **Include context**: Provide details in the `details` field (will be logged internally)
3. **Use field-level errors**: For validation errors, include `fields` array with field-specific messages
4. **Check status codes**: Clients should use HTTP status codes to decide retry behavior:
   - 4xx = client error, don't retry
   - 5xx = server error, might retry
   - 429 = rate limit, retry after delay
5. **Log appropriately**: Log 4xx errors as warnings, 5xx errors as errors (with full details)
6. **Security**: Internal errors are automatically sanitized - don't manually expose `details` or `originalError` to clients

## Migration Guide

### Before

```typescript
try {
  // ...
} catch (error: any) {
  return c.json({ success: false, error: error.message }, 500);
}
```

### After

```typescript
import { errorHandler } from '../middleware/errorHandler';

routes.use('*', errorHandler);

routes.post('/', async (c) => {
  // Just throw errors - middleware handles them
  const result = await service.doSomething();
  return c.json({ success: true, data: result });
});
```

## Files

- `packages/shared/src/errors/types.ts`: Error codes and types
- `packages/shared/src/errors/base-errors.ts`: Error class definitions
- `packages/shared/src/errors/error-handler.ts`: Error normalization utilities
- `apps/api/src/middleware/errorHandler.ts`: Hono error handling middleware
