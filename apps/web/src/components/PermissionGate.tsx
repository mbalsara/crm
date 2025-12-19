import { ReactNode } from 'react';
import { useAuth, Permission, type PermissionType } from '@/src/contexts/AuthContext';

interface PermissionGateProps {
  /** Required permission(s) to render children */
  permission: PermissionType | PermissionType[];
  /** Require all permissions (AND) vs any permission (OR). Default: false (OR) */
  requireAll?: boolean;
  /** Content to render if permission check passes */
  children: ReactNode;
  /** Optional fallback content if permission check fails */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on user permissions
 *
 * @example Single permission
 * <PermissionGate permission={Permission.USER_ADD}>
 *   <Button>Add User</Button>
 * </PermissionGate>
 *
 * @example Multiple permissions (OR - any)
 * <PermissionGate permission={[Permission.USER_ADD, Permission.USER_EDIT]}>
 *   <Button>Manage Users</Button>
 * </PermissionGate>
 *
 * @example Multiple permissions (AND - all required)
 * <PermissionGate permission={[Permission.USER_ADD, Permission.ADMIN]} requireAll>
 *   <Button>Admin Add User</Button>
 * </PermissionGate>
 *
 * @example With fallback
 * <PermissionGate permission={Permission.USER_ADD} fallback={<span>No access</span>}>
 *   <Button>Add User</Button>
 * </PermissionGate>
 */
export function PermissionGate({
  permission,
  requireAll = false,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { hasPermission, isAdmin } = useAuth();

  // Admins have all permissions
  if (isAdmin) {
    return <>{children}</>;
  }

  const permissions = Array.isArray(permission) ? permission : [permission];

  const hasAccess = requireAll
    ? permissions.every((p) => hasPermission(p))
    : permissions.some((p) => hasPermission(p));

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * Hook to check if user has a specific permission
 *
 * @example
 * const canAddUser = usePermission(Permission.USER_ADD);
 * if (canAddUser) { ... }
 */
export function usePermission(permission: PermissionType): boolean {
  const { hasPermission, isAdmin } = useAuth();
  return isAdmin || hasPermission(permission);
}

/**
 * Hook to check if user has any of the specified permissions
 *
 * @example
 * const canManageUsers = useAnyPermission([Permission.USER_ADD, Permission.USER_EDIT]);
 */
export function useAnyPermission(permissions: PermissionType[]): boolean {
  const { hasPermission, isAdmin } = useAuth();
  return isAdmin || permissions.some((p) => hasPermission(p));
}

/**
 * Hook to check if user has all of the specified permissions
 *
 * @example
 * const canFullyManage = useAllPermissions([Permission.USER_ADD, Permission.USER_EDIT, Permission.USER_DEL]);
 */
export function useAllPermissions(permissions: PermissionType[]): boolean {
  const { hasPermission, isAdmin } = useAuth();
  return isAdmin || permissions.every((p) => hasPermission(p));
}

// Re-export Permission enum for convenience
export { Permission };
