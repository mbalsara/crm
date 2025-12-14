# Frontend Employee to User Migration

## Overview

Migrate frontend UI from "employee" terminology to "user" terminology to match backend and prepare for better-auth integration.

## Current State

**Backend:** ✅ Already migrated
- API endpoints: `/api/users/*`
- Services, repositories use "user" terminology

**Frontend:** ⚠️ Still uses "employee" terminology
- Routes: `/employees`
- Components: `employee-form.tsx`, `employee-card.tsx`, `employee-table.tsx`
- UI text: "Employee", "Employees", "Add Employee"
- **But:** Already calls `/api/users/*` endpoints (functionality works)

## Migration Scope

### Files to Rename

1. `apps/web/app/employees/page.tsx` → `apps/web/app/users/page.tsx`
2. `apps/web/components/employees/employee-form.tsx` → `apps/web/components/users/user-form.tsx`
3. `apps/web/components/employees/employee-card.tsx` → `apps/web/components/users/user-card.tsx`
4. `apps/web/components/employees/employee-table.tsx` → `apps/web/components/users/user-table.tsx`

### Files to Update (Terminology Changes)

1. `apps/web/app/users/page.tsx` (renamed)
   - "Employees" → "Users"
   - "Employee" → "User"
   - "Add Employee" → "Add User"
   - `employees` variable → `users`
   - `Employee` type → `User` type

2. `apps/web/components/users/user-form.tsx` (renamed)
   - `EmployeeFormData` → `UserFormData`
   - "Employee" → "User" in labels/comments

3. `apps/web/components/users/user-card.tsx` (renamed)
   - `Employee` type → `User` type
   - `employee` prop → `user` prop

4. `apps/web/components/users/user-table.tsx` (renamed)
   - `Employee` type → `User` type
   - `employees` prop → `users` prop

5. Other files that import/use employee components:
   - `apps/web/components/employee-drawer.tsx` → `apps/web/components/user-drawer.tsx`
   - `apps/web/components/add-employee-drawer.tsx` → `apps/web/components/add-user-drawer.tsx`
   - `apps/web/src/App.tsx` - Update routes/imports
   - `apps/web/lib/types.ts` - Update type definitions
   - `apps/web/lib/hooks.ts` - Already uses `useUsers`, verify consistency

### Routes to Update

- `/employees` → `/users`
- Update navigation/routing configuration

## Migration Steps

### Step 1: Create New User Components

1. Copy employee components to user components
2. Update terminology in new components
3. Update imports and types

### Step 2: Update Page Route

1. Create `apps/web/app/users/page.tsx`
2. Update routing configuration
3. Remove old `/employees` route

### Step 3: Update All Imports

1. Find all files importing employee components
2. Update imports to use user components
3. Update type references

### Step 4: Update Types

1. Update `apps/web/lib/types.ts`
2. Rename `Employee` type to `User`
3. Update `mapUserToEmployee` → `mapUserToUser` (or remove if redundant)

### Step 5: Cleanup

1. Delete old employee component files
2. Delete old employee page
3. Verify no remaining references

## Testing Checklist

- [ ] `/users` page loads correctly
- [ ] User list displays correctly
- [ ] User form works (add/edit)
- [ ] User card displays correctly
- [ ] User table displays correctly
- [ ] Search functionality works
- [ ] Import/export works
- [ ] Navigation links updated
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] All API calls still work (already using `/api/users/*`)

## Rollback Plan

If issues arise:
1. Keep old employee files until migration verified
2. Can revert routing to `/employees` temporarily
3. Git commit before migration for easy rollback

## Estimated Time

- Component renaming: 30 minutes
- Terminology updates: 1 hour
- Testing: 30 minutes
- **Total: ~2 hours**
