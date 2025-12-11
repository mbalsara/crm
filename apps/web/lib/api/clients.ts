import { UserClient, CompanyClient, ContactClient } from '@crm/clients';
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

// Singleton client instances
let userClient: UserClient | null = null;
let companyClient: CompanyClient | null = null;
let contactClient: ContactClient | null = null;

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
 * Get the Company client instance
 */
export function getCompanyClient(): CompanyClient {
  if (!companyClient) {
    companyClient = initializeClient(new CompanyClient(API_BASE_URL));
  }
  return companyClient;
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
 * Set the session token for all clients (for authenticated requests)
 */
export function setSessionToken(token: string): void {
  getUserClient().setSessionToken(token);
  getCompanyClient().setSessionToken(token);
  getContactClient().setSessionToken(token);
}

/**
 * Clear all client instances (useful for logout)
 */
export function clearClients(): void {
  userClient = null;
  companyClient = null;
  contactClient = null;
}
