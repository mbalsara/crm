import { UserClient, CustomerClient, ContactClient, IntegrationClient, EmailClient } from '@crm/clients';
import { authService } from '@/lib/auth/auth-service';

// Extend Window interface for runtime config
declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      API_URL?: string;
    };
  }
}

// API base URL - prefer runtime config, fall back to build-time env var, then localhost
const API_BASE_URL =
  window.__RUNTIME_CONFIG__?.API_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:4001';

// Export for use in integrations page
export { API_BASE_URL };

// Singleton client instances
let userClient: UserClient | null = null;
let customerClient: CustomerClient | null = null;
let contactClient: ContactClient | null = null;
let integrationClient: IntegrationClient | null = null;
let emailClient: EmailClient | null = null;

/**
 * Initialize client with auth token from AuthService
 */
function initializeClient<T extends { setSessionToken: (token: string) => void }>(client: T): T {
  const token = authService.getToken();
  if (token) {
    client.setSessionToken(token);
  }
  return client;
}

/**
 * Get the User client instance
 */
export function getUserClient(): UserClient {
  if (!userClient) {
    userClient = initializeClient(new UserClient(API_BASE_URL));
  }
  return userClient;
}

/**
 * Get the Customer client instance
 */
export function getCustomerClient(): CustomerClient {
  if (!customerClient) {
    customerClient = initializeClient(new CustomerClient(API_BASE_URL));
  }
  return customerClient;
}

/**
 * Get the Contact client instance
 */
export function getContactClient(): ContactClient {
  if (!contactClient) {
    contactClient = initializeClient(new ContactClient(API_BASE_URL));
  }
  return contactClient;
}

/**
 * Get the Integration client instance
 */
export function getIntegrationClient(): IntegrationClient {
  if (!integrationClient) {
    integrationClient = initializeClient(new IntegrationClient(API_BASE_URL));
  }
  return integrationClient;
}

/**
 * Get the Email client instance
 */
export function getEmailClient(): EmailClient {
  if (!emailClient) {
    emailClient = initializeClient(new EmailClient(API_BASE_URL));
  }
  return emailClient;
}

/**
 * Set the session token for all clients (for authenticated requests)
 */
export function setSessionToken(token: string): void {
  getUserClient().setSessionToken(token);
  getCustomerClient().setSessionToken(token);
  getContactClient().setSessionToken(token);
  getIntegrationClient().setSessionToken(token);
  getEmailClient().setSessionToken(token);
}

/**
 * Clear all client instances (useful for logout)
 */
export function clearClients(): void {
  userClient = null;
  customerClient = null;
  contactClient = null;
  integrationClient = null;
  emailClient = null;
}
