/**
 * Authentication Service
 *
 * This service manages user authentication state using better-auth.
 * Provides synchronous access to cached session data for components.
 */
import { authClient, signInWithGoogle as doSignInWithGoogle, signOut as doSignOut } from '@/src/lib/auth';

export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
  name?: string;
}

class AuthService {
  private user: AuthUser | null = null;
  private sessionPromise: Promise<void> | null = null;
  private initialized = false;

  /**
   * Initialize the auth service by fetching the current session.
   * Call this early in app lifecycle (e.g., in layout or provider).
   */
  async initialize(): Promise<void> {
    if (this.sessionPromise) {
      return this.sessionPromise;
    }

    this.sessionPromise = this.refreshSession();
    return this.sessionPromise;
  }

  /**
   * Refresh the session from the server.
   */
  async refreshSession(): Promise<void> {
    try {
      const session = await authClient.getSession();

      if (session?.data?.user) {
        const user = session.data.user as { id: string; email: string; name?: string; tenantId?: string };
        this.user = {
          userId: user.id,
          tenantId: user.tenantId || '',
          email: user.email,
          name: user.name,
        };
      } else {
        this.user = null;
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to fetch session:', error);
      this.user = null;
      this.initialized = true;
    }
  }

  /**
   * Get the cached user (synchronous).
   * Returns null if not authenticated or session not yet loaded.
   */
  getUser(): AuthUser | null {
    return this.user;
  }

  /**
   * Check if user is authenticated (synchronous, based on cached state).
   */
  isAuthenticated(): boolean {
    return this.user !== null;
  }

  /**
   * Check if auth service has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get tenant ID (synchronous, from cached session).
   * Returns null if not authenticated.
   */
  getTenantId(): string | null {
    return this.user?.tenantId || null;
  }

  /**
   * Sign in with Google OAuth.
   * Redirects to Google for authentication.
   */
  async loginWithGoogle(): Promise<void> {
    await doSignInWithGoogle();
  }

  /**
   * Sign out the current user.
   */
  async logout(): Promise<void> {
    await doSignOut();
    this.user = null;
  }

  /**
   * Manually set session (for testing or edge cases).
   */
  setSession(user: AuthUser): void {
    this.user = user;
    this.initialized = true;
  }

  /**
   * Clear the cached session.
   */
  clearSession(): void {
    this.user = null;
  }
}

export const authService = new AuthService();
