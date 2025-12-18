import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient, getSession, signOut } from '../lib/auth';
import { authService } from '@/lib/auth/auth-service';

interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: boolean;
  tenantId?: string | null; // Custom field stored in better_auth_user table
  createdAt?: Date;
  updatedAt?: Date;
}

interface Session {
  user: User;
  session: {
    id: string;
    expiresAt: Date;
  };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const refreshSession = async () => {
    try {
      const result = await getSession();
      if (result?.data?.user) {
        const userData = result.data.user as User;
        setUser(userData);
        setSession(result.data as Session);
        // Keep authService in sync for components that use it directly
        authService.setSession({
          userId: userData.id,
          tenantId: userData.tenantId || '',
          email: userData.email,
          name: userData.name || undefined,
        });
      } else {
        setUser(null);
        setSession(null);
        authService.clearSession();
      }
    } catch (error) {
      console.error('Failed to get session:', error);
      setUser(null);
      setSession(null);
      authService.clearSession();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setSession(null);
      authService.clearSession();
      navigate('/login');
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  useEffect(() => {
    // Check session on mount
    refreshSession();

    // Set up periodic session refresh (every 5 minutes)
    const interval = setInterval(() => {
      refreshSession();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Handle auth success/error from URL params (after OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get('auth');
    
    if (authStatus === 'success') {
      // Clear the URL param
      window.history.replaceState({}, '', window.location.pathname);
      // Refresh session
      refreshSession();
    } else if (authStatus === 'error') {
      const errorMessage = params.get('message') || 'Authentication failed';
      console.error('Auth error:', errorMessage);
      // Clear the URL param
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        signOut: handleSignOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
