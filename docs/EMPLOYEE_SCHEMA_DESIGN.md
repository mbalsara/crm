# Employee Schema Design

## Overview

This document defines the employee data model, including hierarchical relationships (managers) and company access control using a denormalized access table for O(1) queries.

## Design Goals

1. **Support many-to-many relationships** - Employees can have multiple managers (matrix org) and access multiple customers (50-100+)
2. **Fast access control queries** - Determine company access in O(1) without recursive queries at runtime
3. **Efficient hierarchy traversal** - Query all descendants and their customers with simple joins
4. **Support for import/export** - Handle bulk operations with clear data formats
5. **Eventually consistent** - Use async rebuild with debouncing to batch rapid changes

---

## Schema Design

### Architecture Overview

```
┌─────────────────┐      ┌─────────────────────┐      ┌───────────────────┐
│    employees    │──────│  employee_managers  │──────│     employees     │
│  (source)       │      │  (source of truth)  │      │  (as managers)    │
└─────────────────┘      └─────────────────────┘      └───────────────────┘
         │
         │               ┌─────────────────────┐
         └───────────────│ employee_customers  │
                         │  (source of truth)  │
                         └─────────────────────┘
                                  │
                                  ▼
                         ┌─────────────────────────────┐
                         │ employee_accessible_customers│
                         │     (denormalized cache)    │
                         └─────────────────────────────┘
```

### Core Tables

```sql
-- Employees (core entity)
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    first_name VARCHAR(60) NOT NULL,
    last_name VARCHAR(60) NOT NULL,
    email VARCHAR(255) NOT NULL,
    row_status SMALLINT NOT NULL DEFAULT 0, -- 0=active, 1=inactive, 2=archived
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uniq_employees_tenant_email UNIQUE (tenant_id, email)
);

-- Direct manager relationships (source of truth)
-- Supports matrix organizations (employee can have multiple managers)
CREATE TABLE employee_managers (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    manager_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (employee_id, manager_id),
    CONSTRAINT chk_no_self_manager CHECK (employee_id != manager_id)
);

-- Direct company assignments (source of truth)
-- Employee can be assigned to many customers (50-100+)
CREATE TABLE employee_customers (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    role VARCHAR(100),  -- e.g., "account_manager", "consultant"
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (employee_id, customer_id)
);

-- Denormalized access control table (computed cache)
-- Contains ALL customers an employee can access:
--   - Their direct assignments
--   - All customers assigned to their descendants (direct + indirect reports)
CREATE TABLE employee_accessible_customers (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    rebuilt_at TIMESTAMPTZ NOT NULL, -- When this row was computed

    PRIMARY KEY (employee_id, customer_id)
);
```

---

## Why Denormalized Access Table?

### Problem: Recursive Queries Are Expensive

To check if a manager can access a company, you need to:
1. Find all descendants (recursive query through employee_managers)
2. Find all customers assigned to those descendants
3. Check if the target company is in that set

With a 5-level hierarchy and 2000 employees, this could be 50-100ms per query.

### Solution: Pre-compute All Access

The `employee_accessible_customers` table stores the **result** of that recursive query:

| employee_id | customer_id | rebuilt_at |
|-------------|------------|------------|
| alice-uuid | company-a | 2024-01-15 |
| alice-uuid | company-b | 2024-01-15 |
| bob-uuid   | company-b | 2024-01-15 |

Now checking access is O(1):
```sql
SELECT EXISTS(
  SELECT 1 FROM employee_accessible_customers
  WHERE employee_id = :employee_id AND customer_id = :customer_id
);
```

### Trade-offs

| Aspect | Denormalized Table | Recursive Query |
|--------|-------------------|-----------------|
| Read performance | O(1) | O(n) where n = hierarchy depth |
| Storage | O(employees × avg_customers) | None |
| Write complexity | Async rebuild needed | None |
| Consistency | Eventually consistent | Always consistent |
| Scaling | Excellent for reads | Degrades with hierarchy size |

For our use case (frequent access checks on every API call, infrequent changes to hierarchy), denormalization wins.

---

## Rebuild Strategy

### When to Rebuild

The access table is rebuilt when:
- Manager relationships change (add/remove manager)
- Company assignments change (add/remove company)
- Bulk import completes
- Employee status changes (active/inactive)

### Debouncing with Inngest

Changes trigger an Inngest event with **5-minute debounce per tenant**:

```typescript
// In EmployeeService
private async queueAccessRebuild(tenantId: string): Promise<void> {
  await inngest.send({
    name: 'employee/access.rebuild',
    data: { tenantId },
  });
}

// Inngest function
inngest.createFunction(
  {
    id: 'rebuild-accessible-customers',
    debounce: {
      key: 'event.data.tenantId',
      period: '5m',  // Batch all changes within 5 minutes
    },
    retries: 3,
  },
  { event: 'employee/access.rebuild' },
  async ({ event, step }) => {
    const { tenantId } = event.data;
    await step.run('rebuild', async () => {
      const repo = container.resolve(EmployeeRepository);
      await repo.rebuildAccessibleCustomers(tenantId);
    });
  }
);
```

**Why 5 minutes?** Bulk operations (import 500 employees, reassign 50 managers) can trigger hundreds of events. Debouncing ensures we rebuild once after all changes settle, not hundreds of times.

### Rebuild Algorithm

The rebuild uses a recursive CTE to traverse the hierarchy:

```sql
WITH RECURSIVE hierarchy AS (
  -- Base case: each active employee is their own ancestor
  SELECT id AS ancestor_id, id AS descendant_id
  FROM employees
  WHERE tenant_id = :tenant_id
    AND row_status = 0  -- Active only

  UNION ALL

  -- Recursive case: follow manager relationships downward
  SELECT h.ancestor_id, em.employee_id AS descendant_id
  FROM hierarchy h
  JOIN employee_managers em ON em.manager_id = h.descendant_id
  JOIN employees e ON e.id = em.employee_id
    AND e.tenant_id = :tenant_id
    AND e.row_status = 0
)
-- Insert accessible customers for each ancestor
INSERT INTO employee_accessible_customers (employee_id, customer_id, rebuilt_at)
SELECT DISTINCT h.ancestor_id, ec.customer_id, NOW()
FROM hierarchy h
JOIN employee_customers ec ON ec.employee_id = h.descendant_id;
```

**How it works:**

1. Start with each employee as their own "ancestor" (self-reference)
2. Recursively follow manager→employee relationships to find all descendants
3. For each ancestor, collect all customers assigned to any descendant
4. Insert distinct (employee, company) pairs

### Example

Given this hierarchy:
```
Alice (CEO)
├── Bob (VP) → assigned to [CompanyA, CompanyB]
│   └── Carol (Mgr) → assigned to [CompanyC]
└── Dave (VP) → assigned to [CompanyD]
```

After rebuild, `employee_accessible_customers` contains:

| employee_id | customer_id |
|-------------|------------|
| Alice | CompanyA |
| Alice | CompanyB |
| Alice | CompanyC |
| Alice | CompanyD |
| Bob | CompanyA |
| Bob | CompanyB |
| Bob | CompanyC |
| Carol | CompanyC |
| Dave | CompanyD |

Alice can access all 4 customers. Bob can access A, B, C (his + Carol's). Carol and Dave only see their own.

---

## Core Queries

### Check if Employee Has Access to Company

```typescript
async hasAccessToCompany(employeeId: string, customerId: string): Promise<boolean> {
  const result = await this.db
    .select({ exists: sql<boolean>`true` })
    .from(employeeAccessibleCustomers)
    .where(and(
      eq(employeeAccessibleCustomers.employeeId, employeeId),
      eq(employeeAccessibleCustomers.customerId, customerId)
    ))
    .limit(1);
  return result.length > 0;
}
```

### Get All Accessible Company IDs

```typescript
async getAccessibleCompanyIds(employeeId: string): Promise<string[]> {
  const result = await this.db
    .select({ customerId: employeeAccessibleCustomers.customerId })
    .from(employeeAccessibleCustomers)
    .where(eq(employeeAccessibleCustomers.employeeId, employeeId));
  return result.map(r => r.customerId);
}
```

### Scoped Query (Filter by Accessible Customers)

```typescript
// In any repository that needs access control
async findContacts(employeeId: string, filters: ContactFilters): Promise<Contact[]> {
  const accessibleCompanyIds = await this.employeeRepo.getAccessibleCompanyIds(employeeId);

  return this.db
    .select()
    .from(contacts)
    .where(and(
      inArray(contacts.customerId, accessibleCompanyIds),
      // ... other filters
    ));
}
```

---

## Performance Characteristics

### With 2000 Employees

| Operation | Time |
|-----------|------|
| Check access to company | ~1ms |
| Get all accessible customers | ~2-5ms |
| Full rebuild (one tenant) | ~50-200ms |

### Storage Requirements

- Worst case: Every employee manages everyone → O(n²) rows
- Typical case: 5-level hierarchy, 50 customers/employee → ~100K rows per tenant
- Each row: ~50 bytes → ~5MB per tenant

---

## Row Status Handling

Employees have three statuses:
- **0 (Active)**: Included in hierarchy, can access customers
- **1 (Inactive)**: Excluded from hierarchy, no access
- **2 (Archived)**: Excluded from hierarchy, no access

The rebuild query filters by `row_status = 0`, so inactive/archived employees:
- Are not included as ancestors (can't access anything)
- Are not included as descendants (their customers aren't inherited by managers)

---

## Eventual Consistency Considerations

### During Rebuild

Between a change and rebuild completion (up to 5 minutes + rebuild time):
- New access may not be reflected immediately
- Removed access may still be granted temporarily

### Mitigation Strategies

1. **Optimistic UI**: Show "changes may take a few minutes to apply"
2. **Sync rebuild for critical operations**: Option to bypass debounce if needed
3. **Dual check for high-security operations**: Real-time recursive check for sensitive operations

For most CRM operations, eventual consistency is acceptable.

---

## Related Documents

- [ACCESS_CONTROL_DESIGN.md](./ACCESS_CONTROL_DESIGN.md) - Scoped queries implementation
- [EMPLOYEE_IMPORT_EXPORT_FORMAT.md](./EMPLOYEE_IMPORT_EXPORT_FORMAT.md) - Bulk import/export format
- [API_CONVENTIONS.md](./API_CONVENTIONS.md) - API patterns including scoped queries
