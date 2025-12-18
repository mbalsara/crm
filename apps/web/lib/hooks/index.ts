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
  useAddCustomerToUser,
  useRemoveCustomerFromUser,
  useSetUserCustomerAssignments,
  useImportUsers,
  userKeys,
} from './use-users';

// Customer hooks
export {
  useCustomers,
  useCustomersByTenant,
  useCustomer,
  useCustomerByDomain,
  useUpsertCustomer,
  customerKeys,
} from './use-customers';

// Theme hooks
export { useThemeColors } from './use-theme-colors';

// Integration hooks
export { useGmailIntegration, useDisconnectIntegration, integrationKeys } from './use-integrations';

// Email hooks
export { useEmailsByCustomer, emailKeys } from './use-emails';

// Contact hooks
export {
  useContactsByCustomer,
  useContactsByTenant,
  useUpsertContact,
  useUpdateContact,
  contactKeys,
} from './use-contacts';
