# Zod Syntax Guide - Always Use Latest Version

## ⚠️ Important: Use Zod v4+ Syntax

This project uses **Zod v4+** which has simplified syntax. Always use the latest Zod syntax, not deprecated v3 patterns.

## Correct Zod v4+ Syntax

### ✅ DO: Use Direct Validators

```typescript
import { z } from 'zod';

// ✅ CORRECT - Zod v4+ syntax
const schema = z.object({
  email: z.email(),           // Direct email validator
  uuid: z.uuid(),             // Direct UUID validator
  url: z.url(),               // Direct URL validator
  string: z.string(),         // String type
  number: z.number(),         // Number type
  boolean: z.boolean(),        // Boolean type
});
```

### ❌ DON'T: Use Deprecated v3 Syntax

```typescript
// ❌ DEPRECATED - Zod v3 syntax (DO NOT USE)
const schema = z.object({
  email: z.string().email(),  // ❌ Deprecated
  uuid: z.string().uuid(),    // ❌ Deprecated
  url: z.string().url(),      // ❌ Deprecated
});
```

## Common Patterns

### Basic Types

```typescript
// ✅ Correct
z.string()
z.number()
z.boolean()
z.date()
z.null()
z.undefined()
```

### Validators

```typescript
// ✅ Correct - Direct validators
z.email()        // Email string
z.uuid()         // UUID string
z.url()          // URL string
z.emoji()        // Emoji string
z.ip()           // IP address
z.cuid()         // CUID string
z.cuid2()        // CUID2 string
z.ulid()         // ULID string
```

### Optional & Nullable

```typescript
// ✅ Correct
z.string().optional()      // Optional string
z.email().optional()       // Optional email
z.uuid().optional()        // Optional UUID
z.string().nullable()      // Nullable string
z.string().nullish()       // Optional and nullable
```

### Arrays & Objects

```typescript
// ✅ Correct
z.array(z.string())
z.array(z.email())
z.object({ ... })
z.record(z.string())       // Record<string, string>
z.record(z.string(), z.number())  // Record<string, number>
```

### Enums & Unions

```typescript
// ✅ Correct
z.enum(['a', 'b', 'c'])
z.union([z.string(), z.number()])
z.discriminatedUnion('type', [
  z.object({ type: z.literal('a'), value: z.string() }),
  z.object({ type: z.literal('b'), value: z.number() }),
])
```

### Transformations

```typescript
// ✅ Correct
z.string().transform((val) => val.toUpperCase())
z.coerce.string()          // Coerce to string
z.coerce.number()           // Coerce to number
z.coerce.date()             // Coerce to date
z.coerce.boolean()          // Coerce to boolean
```

## Examples from Codebase

### Request Schemas

```typescript
// ✅ Correct
const loginRequestSchema = z.object({
  email: z.email(),
  tenantId: z.uuid().optional(),
});

const createUserSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.email(),
  managerEmails: z.array(z.email()).optional().default([]),
});
```

### Response Schemas

```typescript
// ✅ Correct
const userResponseSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
```

## Migration from v3 to v4

If you see deprecated v3 syntax, update it:

```typescript
// ❌ Old (v3)
z.string().email()
z.string().uuid()
z.string().url()

// ✅ New (v4+)
z.email()
z.uuid()
z.url()
```

## References

- [Zod v4 Documentation](https://zod.dev/)
- Always check Zod version: `pnpm list zod`
- Use latest syntax patterns from Zod docs

## Checklist

When writing Zod schemas:
- [ ] Use `z.email()` not `z.string().email()`
- [ ] Use `z.uuid()` not `z.string().uuid()`
- [ ] Use `z.url()` not `z.string().url()`
- [ ] Check Zod version matches latest patterns
- [ ] Avoid deprecated v3 syntax
