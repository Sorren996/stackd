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
      // Cache-first defaults: a screen paints what it already has and
      // revalidates quietly behind it, so a tab tap never waits on the network.
      // Every per-query option still wins over these — no query's own staleTime
      // is lowered or removed by them.
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // One retry, and never for an auth failure: a 401/403 will not succeed on
      // a second attempt and must reach the auth handler immediately.
      retry: (failureCount, error) => {
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