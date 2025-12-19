import { injectable, inject } from 'tsyringe';
import { RoleRepository } from './repository';
import type { Role, NewRole } from './schema';
import { logger } from '../utils/logger';

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions: number[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissions?: number[];
}

@injectable()
export class RoleService {
  constructor(@inject(RoleRepository) private roleRepository: RoleRepository) {}

  /**
   * Get all roles for a tenant
   */
  async getRolesByTenant(tenantId: string): Promise<Role[]> {
    return this.roleRepository.findByTenantId(tenantId);
  }

  /**
   * Get role by ID
   */
  async getRoleById(id: string): Promise<Role | undefined> {
    return this.roleRepository.findById(id);
  }

  /**
   * Get role by name
   */
  async getRoleByName(tenantId: string, name: string): Promise<Role | undefined> {
    return this.roleRepository.findByName(tenantId, name);
  }

  /**
   * Create a new custom role
   */
  async createRole(tenantId: string, request: CreateRoleRequest): Promise<Role> {
    // Check if role name already exists
    const existing = await this.roleRepository.findByName(tenantId, request.name);
    if (existing) {
      throw new Error(`Role with name "${request.name}" already exists`);
    }

    const role = await this.roleRepository.create({
      tenantId,
      name: request.name,
      description: request.description || null,
      permissions: request.permissions,
      isSystem: false, // Custom roles are not system roles
    });

    logger.info(
      { tenantId, roleId: role.id, name: role.name },
      'Created custom role'
    );

    return role;
  }

  /**
   * Update a role's permissions or details
   * Note: System role names cannot be changed
   */
  async updateRole(
    tenantId: string,
    roleId: string,
    request: UpdateRoleRequest
  ): Promise<Role | undefined> {
    const role = await this.roleRepository.findById(roleId);
    if (!role || role.tenantId !== tenantId) {
      return undefined;
    }

    // Don't allow changing system role names
    if (role.isSystem && request.name && request.name !== role.name) {
      throw new Error('Cannot change the name of a system role');
    }

    const updates: Partial<NewRole> = {};
    if (request.name !== undefined) updates.name = request.name;
    if (request.description !== undefined) updates.description = request.description;
    if (request.permissions !== undefined) updates.permissions = request.permissions;

    const updated = await this.roleRepository.update(roleId, updates);

    if (updated) {
      logger.info(
        { tenantId, roleId, updates: Object.keys(request) },
        'Updated role'
      );
    }

    return updated;
  }

  /**
   * Delete a custom role
   * System roles cannot be deleted
   */
  async deleteRole(tenantId: string, roleId: string): Promise<boolean> {
    const role = await this.roleRepository.findById(roleId);
    if (!role || role.tenantId !== tenantId) {
      return false;
    }

    if (role.isSystem) {
      throw new Error('Cannot delete a system role');
    }

    const deleted = await this.roleRepository.delete(roleId);

    if (deleted) {
      logger.info({ tenantId, roleId, name: role.name }, 'Deleted custom role');
    }

    return deleted;
  }

  /**
   * Seed default roles for a new tenant
   */
  async seedDefaultRoles(tenantId: string): Promise<Role[]> {
    return this.roleRepository.seedDefaultRoles(tenantId);
  }

  /**
   * Get the default User role for assigning to new users
   */
  async getDefaultUserRole(tenantId: string): Promise<Role | undefined> {
    return this.roleRepository.getDefaultUserRole(tenantId);
  }

  /**
   * Get the Administrator role
   */
  async getAdminRole(tenantId: string): Promise<Role | undefined> {
    return this.roleRepository.getAdminRole(tenantId);
  }
}
