import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';

// Global handler for authentication failures during queries/mutations.
// When a protected request returns 401, we clear all cached data to prevent
// any cross-account data exposure and signal the auth context.
let onAuthFailureCallback = null;

export function setOnAuthFailure(callback) {
  onAuthFailureCallback = callback;
}

function isAuthError(error) {
  if (!error) return false;
  const status = error.status || error.response?.status;
  // A resource-level 403 is a permission failure, not proof of session expiry.
  return status === 401;
}

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry auth failures — they won't succeed
        if (isAuthError(error) || (error?.status || error?.response?.status) === 403) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      if (isAuthError(error) && onAuthFailureCallback) {
        onAuthFailureCallback();
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isAuthError(error) && onAuthFailureCallback) {
        onAuthFailureCallback();
      }
    },
  }),
});