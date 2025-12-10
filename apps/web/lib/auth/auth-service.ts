/**
 * Authentication Service
 *
 * This service manages user authentication state.
 * Currently uses a hardcoded dev token for testing.
 * Will be replaced with Google SSO authentication.
 */

export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
}

// Hardcoded dev token for testing - will be replaced with Google SSO
const DEV_TOKEN = 'eyJ1c2VySWQiOiIwMTlhZjA5Ni0wNGFjLTczMGMtYjc1Yy03ZmMzOTk2YzM3NDIiLCJ0ZW5hbnRJZCI6IjAxOWE4ZTg4LTdmY2ItNzIzNS1iNDI3LTI1Yjc3ZmVkMDU2MyIsImVtYWlsIjoiam9obkBleGFtcGxlLmNvbSIsImV4cGlyZXNBdCI6NDkxODk5NjYzNTkyOH0.2J0zHP8S8LG-gXSKlI__0DGpBq_iNsWX9HSGlr8EhUE';

const DEV_USER: AuthUser = {
  userId: '019af096-04ac-730c-b75c-7fc3996c3742',
  tenantId: '019a8e88-7fcb-7235-b427-25b77fed0563',
  email: 'john@example.com',
};

class AuthService {
  // TODO: Replace hardcoded values with Google SSO
  private token: string | null = DEV_TOKEN;
  private user: AuthUser | null = DEV_USER;

  getToken(): string | null {
    return this.token;
  }

  getUser(): AuthUser | null {
    return this.user;
  }

  isAuthenticated(): boolean {
    return this.token !== null && this.user !== null;
  }

  getTenantId(): string | null {
    return this.user?.tenantId || null;
  }

  // TODO: Implement Google SSO
  async loginWithGoogle(): Promise<void> {
    throw new Error('Google SSO not implemented yet');
  }

  logout(): void {
    this.token = null;
    this.user = null;
  }

  setSession(token: string, user: AuthUser): void {
    this.token = token;
    this.user = user;
  }
}

export const authService = new AuthService();
