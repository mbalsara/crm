// Re-export all API functions
export * from './users';
export * from './companies';
export * from './contacts';
export { setSessionToken, clearClients } from './clients';

// Re-export types from @crm/clients for convenience
export type {
  UserResponse,
  CreateUserRequest,
  UpdateUserRequest,
  AddManagerRequest,
  AddCompanyRequest,
  Company,
  CreateCompanyRequest,
  Contact,
  CreateContactRequest,
} from '@crm/clients';

// Re-export shared types
export type { SearchRequest, SearchResponse } from '@crm/shared';
