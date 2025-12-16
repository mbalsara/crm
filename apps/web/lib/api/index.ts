// Re-export all API functions
export * from './users';
export * from './companies';
export * from './contacts';
export * from './integrations';
export * from './emails';
export { setSessionToken, clearClients, API_BASE_URL } from './clients';

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
  Integration,
  IntegrationSource,
} from '@crm/clients';

// Re-export shared types
export type { SearchRequest, SearchResponse } from '@crm/shared';
