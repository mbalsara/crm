# User-Customer Assignments Refactor

## Summary
Rename `user_customers` to `user_customers`, add role support with predefined UUIDs, and update UI to allow adding/removing customer+role rows with autocomplete.

## Design Decisions
- **Role Storage**: Hardcoded UUIDs as constants (can migrate to table later)
- **Predefined Roles**: Account Manager, Technical Lead, Executive Sponsor
- **UI Pattern**: Reusable CustomerAutocomplete component with Popover+Command pattern
- **Data Model**: Each row = customer + role (not array of customers)

---

## Predefined Roles (Hardcoded UUIDs)

```typescript
export const CUSTOMER_ROLES = {
  ACCOUNT_MANAGER: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Account Manager',
  },
  TECHNICAL_LEAD: {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Technical Lead',
  },
  EXECUTIVE_SPONSOR: {
    id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'Executive Sponsor',
  },
} as const;
```

---

## Phase 1: Database Schema Changes

**1.1 Rename table and update role column** (`apps/api/src/users/schema.ts`)

```typescript
// Rename: user_customers → user_customers
export const userCustomers = pgTable('user_customers', {
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull(),  // Changed from varchar to uuid
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.customerId] }),
  index('idx_user_customers_customer').on(table.customerId),
  index('idx_user_customers_user').on(table.userId),
]);
```

**1.2 Update user_accessible_customers** (`apps/api/src/users/schema.ts`)
- Rename to `user_accessible_customers` (or keep for now since it's internal)

**1.3 SQL Migration** (`sql/migrations/`)
```sql
-- Rename table
ALTER TABLE user_customers RENAME TO user_customers;

-- Rename column and change type
ALTER TABLE user_customers RENAME COLUMN customer_id TO customer_id;
ALTER TABLE user_customers ALTER COLUMN role TYPE uuid USING NULL;

-- Update indexes
ALTER INDEX idx_user_customers_company RENAME TO idx_user_customers_customer;
ALTER INDEX idx_user_customers_user RENAME TO idx_user_customers_user;
```

---

## Phase 2: Shared Package - Role Constants

**2.1 Create role constants** (`packages/shared/src/types/customer-roles.ts`)

```typescript
export interface CustomerRole {
  id: string;
  name: string;
}

export const CUSTOMER_ROLES: Record<string, CustomerRole> = {
  ACCOUNT_MANAGER: { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Account Manager' },
  TECHNICAL_LEAD: { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Technical Lead' },
  EXECUTIVE_SPONSOR: { id: '550e8400-e29b-41d4-a716-446655440003', name: 'Executive Sponsor' },
};

export const CUSTOMER_ROLES_LIST = Object.values(CUSTOMER_ROLES);

export function getCustomerRoleById(id: string): CustomerRole | undefined {
  return CUSTOMER_ROLES_LIST.find(r => r.id === id);
}

export function getCustomerRoleName(id: string): string {
  return getCustomerRoleById(id)?.name ?? 'Unknown';
}
```

**2.2 Export from shared** (`packages/shared/src/index.ts`)

---

## Phase 3: API Layer Updates

**3.1 Update Repository** (`apps/api/src/users/repository.ts`)

- Rename all `userCustomers` → `userCustomers`
- Rename all `customerId` → `customerId`
- Change `role: string` → `roleId: string`
- Update type `UserCompany` → `UserCustomer`

```typescript
export interface UserCustomer {
  userId: string;
  customerId: string;
  roleId: string;
  createdAt: Date;
}

async getCustomerAssignments(userId: string): Promise<UserCustomer[]>
async addCustomerAssignment(userId: string, customerId: string, roleId: string): Promise<UserCustomer>
async removeCustomerAssignment(userId: string, customerId: string): Promise<void>
async setCustomerAssignments(userId: string, assignments: Array<{ customerId: string; roleId: string }>): Promise<void>
```

**3.2 Update Service** (`apps/api/src/users/service.ts`)

- Rename methods to match repository
- Update parameter types

**3.3 Update Routes** (`apps/api/src/users/routes.ts`)

```typescript
// POST /api/users/:id/customers
// Request: { customerId: string; roleId: string }

// DELETE /api/users/:id/customers/:customerId

// GET /api/users/:id/customers
// Response: Array<{ customerId: string; roleId: string; customer: Customer }>
```

**3.4 Update Import/Export** (`apps/api/src/users/import-export.ts`)
- Update CSV format to include roleId

---

## Phase 4: Client Package Updates

**4.1 Update User Types** (`packages/clients/src/user/types.ts`)

```typescript
export interface UserCustomerAssignment {
  customerId: string;
  roleId: string;
  customerName?: string;  // For display
}

export interface User {
  // ... existing fields
  customerAssignments: UserCustomerAssignment[];  // Replace assignedCustomers: string[]
}
```

**4.2 Update User Client** (`packages/clients/src/user/client.ts`)
- Update methods to use new types

---

## Phase 5: Web App - Reusable Components

**5.1 Create CustomerAutocomplete Component** (`apps/web/components/ui/customer-autocomplete.tsx`)

```typescript
interface CustomerAutocompleteProps {
  value: string | null;  // customerId
  onChange: (customerId: string | null, customerName: string) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeIds?: string[];  // Hide already-selected customers
}
```

Features:
- Popover + Command pattern (consistent with existing UI)
- Server-side search via useCustomers hook
- Displays customer name, shows domain in subtitle
- Single-select (one customer per row)

**5.2 Create RoleSelect Component** (`apps/web/components/ui/role-select.tsx`)

```typescript
interface RoleSelectProps {
  value: string | null;  // roleId
  onChange: (roleId: string) => void;
  disabled?: boolean;
}
```

Features:
- Standard Select component
- Populated from CUSTOMER_ROLES_LIST
- Shows role name

---

## Phase 6: Web App - User Form Updates

**6.1 Update UserFormData** (`apps/web/components/users/user-form.tsx`)

```typescript
interface CustomerAssignmentRow {
  id: string;  // Temporary ID for React key
  customerId: string | null;
  customerName: string;
  roleId: string | null;
}

interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
  department?: string;
  reportsTo: string[];
  customerAssignments: CustomerAssignmentRow[];  // Replace assignedCustomers
}
```

**6.2 Update Form UI**

Replace the current company multi-select with:

```tsx
<div className="space-y-2">
  <Label>Assigned Customers</Label>

  {/* List of customer+role rows */}
  {customerAssignments.map((assignment, index) => (
    <div key={assignment.id} className="flex items-center gap-2">
      <CustomerAutocomplete
        value={assignment.customerId}
        onChange={(id, name) => updateAssignment(index, { customerId: id, customerName: name })}
        excludeIds={selectedCustomerIds}
        className="flex-1"
      />
      <RoleSelect
        value={assignment.roleId}
        onChange={(roleId) => updateAssignment(index, { roleId })}
        className="w-48"
      />
      <Button variant="ghost" size="icon" onClick={() => removeAssignment(index)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  ))}

  {/* Add button */}
  <Button variant="outline" size="sm" onClick={addAssignment}>
    <Plus className="h-4 w-4 mr-1" />
    Add Customer
  </Button>
</div>
```

**6.3 Update User Types** (`apps/web/lib/types.ts`)

```typescript
export interface User {
  // ... existing fields
  customerAssignments: Array<{
    customerId: string;
    roleId: string;
    customerName?: string;
  }>;
}
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `packages/shared/src/types/customer-roles.ts` | **New** - Role constants |
| `packages/shared/src/index.ts` | Export roles |
| `apps/api/src/users/schema.ts` | Rename table, change role type |
| `apps/api/src/users/repository.ts` | Rename methods, update types |
| `apps/api/src/users/service.ts` | Rename methods, update types |
| `apps/api/src/users/routes.ts` | Update endpoints |
| `apps/api/src/users/import-export.ts` | Update CSV format |
| `packages/clients/src/user/types.ts` | Update User type |
| `packages/clients/src/user/client.ts` | Update methods |
| `apps/web/components/ui/customer-autocomplete.tsx` | **New** - Reusable component |
| `apps/web/components/ui/role-select.tsx` | **New** - Role dropdown |
| `apps/web/components/users/user-form.tsx` | Replace multi-select with rows |
| `apps/web/lib/types.ts` | Update User type |
| `apps/web/lib/api/users.ts` | Update API calls |

---

## Implementation Order

1. **Shared package** - Add role constants
2. **Database schema** - Rename table, add roleId
3. **API layer** - Update repository, service, routes
4. **Client package** - Update types and client
5. **UI components** - Create CustomerAutocomplete and RoleSelect
6. **User form** - Replace multi-select with customer+role rows
7. **Build and test** - Verify all packages compile

---

## Migration Notes

- Existing `user_customers` data will need migration
- Existing assignments will have `roleId = NULL` initially
- UI should handle NULL roleId gracefully (show "Select role" placeholder)
- Consider backfilling existing assignments with a default role
