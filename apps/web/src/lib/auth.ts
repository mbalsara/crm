import { createAuthClient } from 'better-auth/client';

// Better-auth client configuration
// baseURL should point to the API server (port 4001)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001';

export const authClient = createAuthClient({
  baseURL: API_URL,
});

// Export convenience methods
export const signInWithGoogle = async () => {
  // Pass callbackURL to redirect back to web app after OAuth
  const webUrl = import.meta.env.VITE_WEB_URL || window.location.origin;
  return authClient.signIn.social({
    provider: 'google',
    callbackURL: `${webUrl}/`, // Redirect to web app root on success
    errorCallbackURL: `${webUrl}/login`, // Redirect to login page on error (with error params)
  });
};

export const signOut = async () => {
  return authClient.signOut();
};

export const getSession = async () => {
  return authClient.getSession();
};
