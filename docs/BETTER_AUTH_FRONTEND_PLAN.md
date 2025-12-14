# Better-Auth Frontend Implementation Plan

## Overview

Frontend needs to integrate with better-auth for Google SSO login, session management, and protected routes.

---

## Phase 1: Install Better-Auth Client

### Step 1.1: Install Package

```bash
cd apps/web
pnpm add better-auth
```

---

## Phase 2: Create Auth Service

### Step 2.1: Create Better-Auth Client

**File:** `apps/web/src/lib/auth.ts`

```typescript
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001',
  basePath: '/api/auth',
});

// Export auth methods
export const {
  signIn,
  signOut,
  useSession,
  getSession,
} = authClient;
```

---

## Phase 3: Create Login Page

### Step 3.1: Create Login Component

**File:** `apps/web/src/app/login/page.tsx` (or `apps/web/src/pages/login.tsx`)

```typescript
'use client';

import { signIn } from '@/lib/auth';
import { useState } from 'react';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await signIn.social({
        provider: 'google',
        callbackURL: '/dashboard', // Redirect after login
      });
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
        <div>
          <h2 className="text-center text-3xl font-bold">Sign In</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in with your Google account
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full rounded-md bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {isLoading ? 'Signing in...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}
```

---

## Phase 4: Session Management

### Step 4.1: Create Auth Context/Provider

**File:** `apps/web/src/contexts/AuthContext.tsx`

```typescript
'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useSession } from '@/lib/auth';

interface AuthContextType {
  user: any | null;
  session: any | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        session: session || null,
        isLoading: isPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### Step 4.2: Wrap App with AuthProvider

**File:** `apps/web/src/app/layout.tsx` (or `_app.tsx`)

```typescript
import { AuthProvider } from '@/contexts/AuthContext';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

---

## Phase 5: Protected Routes

### Step 5.1: Create Protected Route Component

**File:** `apps/web/src/components/ProtectedRoute.tsx`

```typescript
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
```

### Step 5.2: Use Protected Route

**File:** `apps/web/src/app/dashboard/page.tsx`

```typescript
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user } = useAuth();

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {user?.email}!</p>
    </div>
  );
}
```

---

## Phase 6: Update Base Client

### Step 6.1: Update Base Client for Better-Auth Sessions

**File:** `packages/clients/src/base-client.ts`

Better-auth handles sessions via cookies automatically, so the base client should:
- Include `credentials: 'include'` for cookies
- No need to manually manage session tokens (better-auth handles it)

```typescript
// Base client already includes credentials: 'include'
// Better-auth sessions work automatically with cookies
// No changes needed if base client already supports cookies
```

---

## Phase 7: Logout

### Step 7.1: Add Logout Button

**File:** `apps/web/src/components/LogoutButton.tsx`

```typescript
'use client';

import { signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <button
      onClick={handleLogout}
      className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
    >
      Sign Out
    </button>
  );
}
```

---

## Environment Variables

**File:** `apps/web/.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:4001
```

---

## Testing Checklist

- [ ] Login page renders
- [ ] Google sign-in button works
- [ ] Redirects to Google OAuth
- [ ] Redirects back after authorization
- [ ] Session persists across page reloads
- [ ] Protected routes redirect to login if not authenticated
- [ ] Logout clears session
- [ ] Session state updates correctly

---

## Summary

**Files to Create:**
1. `apps/web/src/lib/auth.ts` - Better-auth client
2. `apps/web/src/contexts/AuthContext.tsx` - Auth context/provider
3. `apps/web/src/app/login/page.tsx` - Login page
4. `apps/web/src/components/ProtectedRoute.tsx` - Protected route wrapper
5. `apps/web/src/components/LogoutButton.tsx` - Logout button

**Files to Modify:**
1. `apps/web/src/app/layout.tsx` - Wrap with AuthProvider
2. Protected pages - Wrap with ProtectedRoute

**Estimated Time:** 2-3 hours
