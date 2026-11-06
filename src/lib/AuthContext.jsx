import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { clearLocalSettingsCache, ensureLocalCacheOwnedBy } from '@/lib/userSettings';
import {
  STARTUP_CODES,
  logStartup,
  startupErrorCode,
  withStartupDeadline,
} from '@/lib/startupDiagnostics';

const AuthContext = createContext();

const LOGOUT_CHANNEL_NAME = 'stackd-logout-sync';
const SESSION_EXPIRED_EVENT = 'stackd-session-expired';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  // A launch step that did not answer inside its deadline. Distinct from an
  // invalid session: nothing is claimed as signed in, and nothing is signed out.
  const [startupError, setStartupError] = useState(null);
  const logoutChannelRef = useRef(null);
  const isLoggingOutRef = useRef(false);
  const mountedRef = useRef(true);
  // Only the newest launch attempt may write state. A retry, an unmount or an
  // account change makes any late completion from an earlier attempt inert.
  const attemptRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Cross-tab logout synchronization via BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let channel = null;
    try {
      channel = new BroadcastChannel(LOGOUT_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === 'logout') {
          // Another tab initiated logout — clear local state and redirect
          performLocalLogout(false);
          window.location.href = '/';
        }
      };
      logoutChannelRef.current = channel;
    } catch {
      // BroadcastChannel not supported — storage event fallback below
    }

    // Storage event fallback for browsers without BroadcastChannel
    const handleStorageChange = (event) => {
      if (event.key === 'stackd-logout-signal' && event.newValue) {
        performLocalLogout(false);
        window.location.href = '/';
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    checkAppState();
  }, []);

  const performLocalLogout = (broadcast = true) => {
    // Clear all user-specific local state
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setSessionExpired(false);

    // Clear cached clinical settings and glucose cache
    clearLocalSettingsCache();

    // Broadcast to other tabs if requested
    if (broadcast) {
      try {
        logoutChannelRef.current?.postMessage({ type: 'logout' });
      } catch {}
      // Storage event fallback
      try {
        const signal = Date.now().toString();
        localStorage.setItem('stackd-logout-signal', signal);
        // Clean up after a moment so it can fire again later
        setTimeout(() => localStorage.removeItem('stackd-logout-signal'), 1000);
      } catch {}
    }
  };

  // One bounded launch check. Public settings and the session restore run
  // together, each against a finite deadline, and only the newest attempt may
  // write state — so a retry, an unmount or an account change can never be
  // overwritten by a late completion from an earlier attempt.
  //
  // A step that times out or cannot be reached is NOT a session answer: the
  // token is left untouched, nothing is claimed as signed in, and the person is
  // offered a calm Retry. Only a definite 401/403 follows the existing safe
  // session-expiry behaviour.
  const checkAppState = useCallback(async () => {
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    const isCurrent = () => mountedRef.current && attemptRef.current === attempt;
    const startedAt = Date.now();

    setStartupError(null);
    setAuthError(null);
    setIsLoadingPublicSettings(true);
    setIsLoadingAuth(true);

    const settingsTask = (async () => {
      try {
        const appClient = createAxiosClient({
          baseURL: `/api/apps/public`,
          headers: {
            'X-App-Id': appParams.appId
          },
          token: appParams.token,
          interceptResponses: true
        });

        const publicSettings = await withStartupDeadline(
          appClient.get(`/prod/public-settings/by-id/${appParams.appId}`)
        );
        if (isCurrent()) setAppPublicSettings(publicSettings);
      } catch (appError) {
        if (!isCurrent()) return;
        const reason = appError?.status === 403 ? appError?.data?.extra_data?.reason : null;
        if (reason === 'auth_required') {
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        } else if (reason === 'user_not_registered') {
          setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
        } else if (reason) {
          setAuthError({ type: reason, message: appError.message });
        } else {
          // Non-fatal: never strands a signed-in person on the marketing page.
          logStartup('public-settings', {
            outcome: 'error',
            code: startupErrorCode(appError),
            durationMs: Date.now() - startedAt,
          });
        }
      } finally {
        if (isCurrent()) setIsLoadingPublicSettings(false);
      }
    })();

    const authTask = (async () => {
      try {
        const currentUser = await withStartupDeadline(base44.auth.me());
        if (!isCurrent()) return;
        if (!currentUser?.id) {
          const noSession = new Error('no-session');
          noSession.status = 401;
          throw noSession;
        }
        // On a shared device, wipe the previous account's cached settings and
        // latest glucose before this session starts so no data crosses accounts.
        ensureLocalCacheOwnedBy(currentUser.id);
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthChecked(true);
        logStartup('auth', { durationMs: Date.now() - startedAt });
      } catch (error) {
        if (!isCurrent()) return;
        const code = startupErrorCode(error);
        setUser(null);
        setIsAuthenticated(false);
        setAuthChecked(true);

        if (code === STARTUP_CODES.UNAUTHORIZED) {
          // Session expired or invalid — clear stale local state.
          clearLocalSettingsCache();
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        } else {
          // Transient: keep credentials, claim nothing, offer Retry.
          setStartupError({
            type: code === STARTUP_CODES.TIMEOUT ? 'timeout' : 'unreachable',
            code,
          });
        }

        logStartup('auth', {
          outcome: 'error',
          code,
          durationMs: Date.now() - startedAt,
        });
      } finally {
        if (isCurrent()) setIsLoadingAuth(false);
      }
    })();

    await Promise.allSettled([settingsTask, authTask]);
  }, []);

  // Existing callers re-run the same bounded check; the newest attempt wins.
  const checkUserAuth = checkAppState;

  /**
   * Centralized session expiration handler.
   * Called when a protected request fails due to an expired session.
   * Clears all authenticated state, hides protected data, and redirects.
   */
  const handleSessionExpired = () => {
    setSessionExpired(true);
    performLocalLogout(true);
    // Use href for full browser navigation to clear all in-memory state
    window.location.href = '/';
  };

  const logout = async (shouldRedirect = true) => {
    // Prevent duplicate logout requests
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    try {
      // Always clear local state immediately so protected data is hidden
      // even if the server request fails (offline, poor connectivity)
      performLocalLogout(shouldRedirect);

      // Attempt the official server-side logout
      if (shouldRedirect) {
        await base44.auth.logout('/');
      } else {
        await base44.auth.logout();
      }
    } catch {
      // Server logout failed — local state is already cleared.
      // Redirect to splash so user sees they're logged out.
      if (shouldRedirect) {
        window.location.href = '/';
      }
    } finally {
      isLoggingOutRef.current = false;
    }
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      sessionExpired,
      startupError,
      retryStartup: checkAppState,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      handleSessionExpired
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};