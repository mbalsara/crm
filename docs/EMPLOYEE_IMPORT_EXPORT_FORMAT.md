# Employee Import/Export Format

## Final Decision: One Row Per Company

The import/export format uses **one row per employee-company assignment**. If an employee is assigned to 50 companies, they appear in 50 rows.

---

## Format Specification

### CSV/Excel Structure

```csv
email,firstName,lastName,managerEmails,companyDomain,role,rowStatus
john@acme.com,John,Doe,jane@acme.com,acme.com,account_manager,0
john@acme.com,John,Doe,jane@acme.com,globex.com,consultant,0
john@acme.com,John,Doe,jane@acme.com,initech.com,,0
jane@acme.com,Jane,Smith,,acme.com,executive,0
bob@acme.com,Bob,Wilson,"jane@acme.com,john@acme.com",acme.com,,0
```

### Column Definitions

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `email` | string | Yes | Employee email (unique identifier within tenant) |
| `firstName` | string | Yes | First name (max 60 chars) |
| `lastName` | string | Yes | Last name (max 60 chars) |
| `managerEmails` | string | No | Comma-separated manager emails (within quotes if multiple) |
| `companyDomain` | string | Yes | Primary domain of the company |
| `role` | string | No | Role at this company (e.g., "account_manager", "consultant") |
| `rowStatus` | number | No | 0 = active (default), 1 = inactive, 2 = archived |

### Example: Employee with Multiple Companies

An employee assigned to 3 companies appears as 3 rows:

| email | firstName | lastName | managerEmails | companyDomain | role | rowStatus |
|-------|-----------|----------|---------------|---------------|------|-----------|
| john@acme.com | John | Doe | jane@acme.com | acme.com | account_manager | 0 |
| john@acme.com | John | Doe | jane@acme.com | globex.com | consultant | 0 |
| john@acme.com | John | Doe | jane@acme.com | initech.com | | 0 |

### Example: Employee with Multiple Managers

Use comma-separated values in quotes:

| email | firstName | lastName | managerEmails | companyDomain | role | rowStatus |
|-------|-----------|----------|---------------|---------------|------|-----------|
| bob@acme.com | Bob | Wilson | "jane@acme.com,john@acme.com" | acme.com | | 0 |

### Example: Top-Level Employee (No Manager)

Leave `managerEmails` empty:

| email | firstName | lastName | managerEmails | companyDomain | role | rowStatus |
|-------|-----------|----------|---------------|---------------|------|-----------|
| ceo@acme.com | Alice | Johnson | | acme.com | ceo | 0 |

---

## Import Process

### Transaction Behavior

Import is **transactional** - all rows succeed or none are committed.

```
1. Parse CSV/Excel file
2. Validate all rows (fail fast on errors)
3. BEGIN TRANSACTION
4. For each unique employee (by email):
   a. Upsert employee record
   b. Clear existing manager relationships
   c. Add new manager relationships
   d. Clear existing company assignments
   e. Add new company assignments
5. COMMIT TRANSACTION
6. Queue hierarchy rebuild (1 min debounce)
```

### Validation Rules

| Rule | Behavior |
|------|----------|
| Invalid email format | Fail import |
| Missing required field | Fail import |
| Manager email not found | Fail import (or warn and skip manager) |
| Company domain not found | Create company with domain as name |
| Duplicate employee rows | Merge (same employee, multiple companies) |
| firstName/lastName differs across rows | Use first occurrence, warn |

### Upsert Behavior

If employee with same email exists:
- **Update** employee info (firstName, lastName, rowStatus)
- **Replace** manager relationships
- **Replace** company assignments

### Error Handling

```typescript
interface ImportResult {
  success: boolean;
  stats: {
    totalRows: number;
    employeesCreated: number;
    employeesUpdated: number;
    companyAssignments: number;
    managerRelationships: number;
  };
  errors: Array<{
    row: number;
    email?: string;
    message: string;
  }>;
}
```

### Example Error Response

```json
{
  "success": false,
  "stats": {
    "totalRows": 100,
    "employeesCreated": 0,
    "employeesUpdated": 0,
    "companyAssignments": 0,
    "managerRelationships": 0
  },
  "errors": [
    { "row": 15, "email": "john@acme.com", "message": "Manager 'unknown@acme.com' not found" },
    { "row": 42, "email": "", "message": "Missing required field: email" }
  ]
}
```

---

## Export Process

### Export All Employees

```
GET /employees/export
Accept: text/csv

or

GET /employees/export?format=xlsx
```

### Export Behavior

1. Fetch all active employees (rowStatus = 0) with their:
   - Manager relationships (resolved to emails)
   - Company assignments (resolved to domains)
2. Generate one row per employee-company assignment
3. Return CSV/Excel file

### Export Filters

| Parameter | Description |
|-----------|-------------|
| `status` | Filter by rowStatus (0, 1, 2) |
| `companyDomain` | Filter by specific company |
| `format` | `csv` (default) or `xlsx` |

---

## Implementation Details

### Zod Schemas

```typescript
// packages/clients/src/employee/types.ts
import { z } from 'zod';

// Single row in import file
export const employeeImportRowSchema = z.object({
  email: z.string().email().max(255),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  managerEmails: z.string().optional().default(''),
  companyDomain: z.string().min(1).max(255),
  role: z.string().max(100).optional(),
  rowStatus: z.coerce.number().int().min(0).max(2).optional().default(0),
});

// Parsed employee (grouped from rows)
export const employeeParsedSchema = z.object({
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  managerEmails: z.array(z.string().email()),
  companyAssignments: z.array(z.object({
    domain: z.string(),
    role: z.string().optional(),
  })),
  rowStatus: z.number(),
});

// Import request
export const employeeImportRequestSchema = z.object({
  createMissingCompanies: z.boolean().default(true),
  failOnMissingManager: z.boolean().default(true),
});

// Import result
export const employeeImportResultSchema = z.object({
  success: z.boolean(),
  stats: z.object({
    totalRows: z.number(),
    employeesCreated: z.number(),
    employeesUpdated: z.number(),
    companyAssignments: z.number(),
    managerRelationships: z.number(),
  }),
  errors: z.array(z.object({
    row: z.number(),
    email: z.string().optional(),
    message: z.string(),
  })),
});

export type EmployeeImportRow = z.infer<typeof employeeImportRowSchema>;
export type EmployeeParsed = z.infer<typeof employeeParsedSchema>;
export type EmployeeImportRequest = z.infer<typeof employeeImportRequestSchema>;
export type EmployeeImportResult = z.infer<typeof employeeImportResultSchema>;
```

### Service Implementation

```typescript
// apps/api/src/employees/service.ts

async import(
  tenantId: string,
  rows: EmployeeImportRow[],
  options: EmployeeImportRequest
): Promise<EmployeeImportResult> {
  // 1. Validate all rows first (fail fast)
  const errors = this.validateRows(rows);
  if (errors.length > 0) {
    return { success: false, stats: emptyStats(), errors };
  }

  // 2. Group rows by employee email
  const employeeMap = this.groupByEmployee(rows);

  // 3. Execute in transaction
  const stats = await this.db.transaction(async (tx) => {
    const stats = { ...emptyStats(), totalRows: rows.length };

    for (const [email, data] of employeeMap) {
      // Upsert employee
      const employee = await this.upsertEmployee(tx, tenantId, data);
      if (data.isNew) stats.employeesCreated++;
      else stats.employeesUpdated++;

      // Resolve and set managers
      const managerIds = await this.resolveManagerIds(tx, tenantId, data.managerEmails);
      await this.setManagers(tx, employee.id, managerIds);
      stats.managerRelationships += managerIds.length;

      // Resolve and set company assignments
      for (const assignment of data.companyAssignments) {
        const companyId = await this.resolveCompanyId(
          tx, tenantId, assignment.domain, options.createMissingCompanies
        );
        await this.assignCompany(tx, employee.id, companyId, assignment.role);
        stats.companyAssignments++;
      }
    }

    return stats;
  });

  // 4. Queue hierarchy rebuild (debounced)
  await inngest.send({
    name: 'employee/hierarchy.rebuild',
    data: { tenantId },
  });

  return { success: true, stats, errors: [] };
}
```

---

## Why One Row Per Company?

| Alternative | Problem |
|-------------|---------|
| Comma-separated companies in one cell | Hard to edit 50+ companies in Excel |
| Separate sheets (employees + assignments) | More complex for users |
| Cross-product (manager × company) | Exponential rows (2 managers × 50 companies = 100 rows) |

**One row per company:**
- Easy to add/remove company assignments
- Can filter by company in Excel
- Role is specific to each company assignment
- Manageable file size (employee with 50 companies = 50 rows)

---

## Hierarchy Rebuild After Import

After import completes, the closure table is rebuilt:

```typescript
// Inngest function with 1 minute debounce
export const rebuildHierarchy = inngest.createFunction(
  {
    id: 'rebuild-employee-hierarchy',
    debounce: {
      key: 'event.data.tenantId',
      period: '1m',  // Batch changes within 1 minute
    },
  },
  { event: 'employee/hierarchy.rebuild' },
  async ({ event }) => {
    const { tenantId } = event.data;
    await db.execute(sql`SELECT rebuild_employee_hierarchy(${tenantId})`);
  }
);
```

---

## Related Documents

- [EMPLOYEE_SCHEMA_DESIGN.md](./EMPLOYEE_SCHEMA_DESIGN.md) - Database schema
- [ACCESS_CONTROL_DESIGN.md](./ACCESS_CONTROL_DESIGN.md) - Scoped queries
- [API_CONVENTIONS.md](./API_CONVENTIONS.md) - API patterns
