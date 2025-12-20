import { getRoleClient } from './clients';
import type { RoleResponse } from '@crm/clients';

/**
 * Get all roles for the current tenant
 */
export async function getRoles(): Promise<RoleResponse[]> {
  return getRoleClient().list();
}

/**
 * Get a role by ID
 */
export async function getRole(id: string): Promise<RoleResponse | null> {
  return getRoleClient().getById(id);
}
