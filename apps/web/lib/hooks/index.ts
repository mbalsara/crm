// User hooks
export {
  useUsers,
  useUser,
  useCreateUser,
  useUpdateUser,
  useMarkUserActive,
  useMarkUserInactive,
  useAddManager,
  useRemoveManager,
  useAddCompanyToUser,
  useRemoveCompanyFromUser,
  useImportUsers,
  userKeys,
} from './use-users';

// Customer hooks (with backwards compatibility aliases)
export {
  useCustomers,
  useCustomersByTenant,
  useCustomer,
  useCustomerByDomain,
  useUpsertCustomer,
  customerKeys,
  // Backwards compatibility
  useCompanies,
  useCompaniesByTenant,
  useCompany,
  useCompanyByDomain,
  useUpsertCompany,
  companyKeys,
} from './use-customers';

// Theme hooks
export { useThemeColors } from './use-theme-colors';

// Integration hooks
export { useGmailIntegration, useDisconnectIntegration, integrationKeys } from './use-integrations';

// Email hooks
export { useEmailsByCustomer, useEmailsByCompany, emailKeys } from './use-emails';

// Contact hooks
export {
  useContactsByCustomer,
  useContactsByCompany,
  useContactsByTenant,
  useUpsertContact,
  useUpdateContact,
  contactKeys,
} from './use-contacts';
