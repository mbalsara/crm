import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { SearchRequest, UserResponse, CreateUserRequest, UpdateUserRequest } from '@/lib/api';

// Query keys for cache management
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: SearchRequest) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

/**
 * Hook to search/list users with pagination and filtering
 */
export function useUsers(request: SearchRequest) {
  return useQuery({
    queryKey: userKeys.list(request),
    queryFn: () => api.searchUsers(request),
  });
}

/**
 * Hook to get a single user by ID
 */
export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => api.getUser(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a new user
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserRequest) => api.createUser(data),
    onSuccess: () => {
      // Invalidate all user lists to refetch
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook to update a user
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserRequest }) =>
      api.updateUser(id, data),
    onSuccess: (user) => {
      // Update the cache for this specific user
      queryClient.setQueryData(userKeys.detail(user.id), user);
      // Invalidate lists to refetch
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook to mark a user as active
 */
export function useMarkUserActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.markUserActive(id),
    onSuccess: (user) => {
      queryClient.setQueryData(userKeys.detail(user.id), user);
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook to mark a user as inactive
 */
export function useMarkUserInactive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.markUserInactive(id),
    onSuccess: (user) => {
      queryClient.setQueryData(userKeys.detail(user.id), user);
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook to add a manager to a user
 */
export function useAddManager() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, managerEmail }: { userId: string; managerEmail: string }) =>
      api.addManager(userId, { managerEmail }),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
}

/**
 * Hook to remove a manager from a user
 */
export function useRemoveManager() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, managerId }: { userId: string; managerId: string }) =>
      api.removeManager(userId, managerId),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
}

/**
 * Hook to add a company to a user
 */
export function useAddCompanyToUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      companyDomain,
      role,
    }: {
      userId: string;
      companyDomain: string;
      role?: string;
    }) => api.addCompanyToUser(userId, { companyDomain, role }),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
}

/**
 * Hook to remove a company from a user
 */
export function useRemoveCompanyFromUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, companyId }: { userId: string; companyId: string }) =>
      api.removeCompanyFromUser(userId, companyId),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
}

/**
 * Hook to import users from a file
 */
export function useImportUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => api.importUsers(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}
