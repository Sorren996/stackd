import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { queryClientInstance } from '@/lib/query-client';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { clearLocalSettingsCache, ensureLocalCacheOwnedBy } from '@/lib/userSettings';
import {
  STARTUP_CODES,
  logStartup,
  startupErrorCode,
} from '@/lib/startupDiagnostics';
import { runStartupCheck, requestStatus, confirmedSessionRejection } from '@/lib/startupRequest';
import { withStartupSignal } from '@/lib/startupAwait';
import softNavigation from '@/lib/softNavigation';
import createStartupSession from '@/lib/startupSession';

const AuthContext = createContext();

const LOGOUT_CHANNEL_NAME = 'stackd-logout-sync';
// Survives a boot-only remount; only an actual account switch clears caches.
let lastVerifiedUserId = null;

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
  const cacheUserRef = useRef(null);
  const bootstrapRef = useRef(null);
  const bootstrapController = useRef(null);
  const sessionRequest = useRef(null);
  if (!sessionRequest.current) sessionRequest.current = createStartupSession(base44);
  const checkSession = useCallback(() => sessionRequest.current.read(), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      bootstrapController.current?.abort();
      sessionRequest.current.retire();
      bootstrapRef.current = null;
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
          softNavigation('/');
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
        softNavigation('/');
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
    attemptRef.current += 1; // Retire an in-flight session check on logout.
    bootstrapController.current?.abort();
    sessionRequest.current.retire();
    bootstrapRef.current = null;
    cacheUserRef.current = null;
    queryClientInstance.clear();
    // Clear all user-specific local state
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setSessionExpired(false);

    // Server gates are already closed even if device storage is unavailable.
    try { clearLocalSettingsCache(); } catch { /* Optional device cache. */ }

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
  const executeAppCheck = useCallback(async (signal) => {
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    const isCurrent = () => mountedRef.current && attemptRef.current === attempt && !signal.aborted;
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

        const publicSettings = await runStartupCheck('public-settings', 'public-settings',
          deadlineSignal => appClient.get(`/prod/public-settings/by-id/${appParams.appId}`, { signal: deadlineSignal }), signal);
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
          // An unanswered bootstrap read is retryable, never a sign-out.
          setStartupError({ type: appError?.startupCode === 'TIMEOUT' ? 'timeout' : 'unreachable',
            startupCode: appError?.startupCode, status: requestStatus(appError) });
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
        const currentUser = await sessionRequest.current.read();
        if (!isCurrent()) return;
        // On a shared device, wipe the previous account's cached settings and
        // latest glucose before this session starts so no data crosses accounts.
        if (lastVerifiedUserId && lastVerifiedUserId !== currentUser.id) queryClientInstance.clear();
        lastVerifiedUserId = currentUser.id;
        cacheUserRef.current = currentUser.id;
        // Device cache availability is not an authentication result.
        try { ensureLocalCacheOwnedBy(currentUser.id); } catch { /* Optional cache only. */ }
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthChecked(true);
        logStartup('auth', { durationMs: Date.now() - startedAt });
      } catch (error) {
        if (!isCurrent()) return;
        const code = startupErrorCode(error);
        setAuthChecked(true);

        if (confirmedSessionRejection(error)) {
          // A real HTTP denial from the session endpoint, while online.
          // Hide protected views without deleting saved preferences or tokens.
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
          if (lastVerifiedUserId) softNavigation('/login');
        } else {
          // Transient: keep credentials, claim nothing, offer Retry.
          setStartupError({
            type: code === STARTUP_CODES.TIMEOUT ? 'timeout' : 'unreachable',
            code,
            status: requestStatus(error),
            startupCode: error?.startupCode,
            startupInvalid: error?.startupInvalid === true,
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

  // Synchronous single-flight lock: overlapping callers join, never supersede
  // a valid slow response. Settled/rejected work is not retained for Retry.
  const checkAppState = useCallback(() => {
    if (bootstrapRef.current) return bootstrapRef.current;
    const controller = new AbortController();
    bootstrapController.current = controller;
    const work = executeAppCheck(controller.signal).finally(() => {
      if (bootstrapRef.current === work) bootstrapRef.current = null;
    });
    bootstrapRef.current = work;
    return work;
  }, [executeAppCheck]);
  // Consent writes require a read begun AFTER the write, not a session probe
  // already in flight before it. Wait for that probe, then share a fresh launch.
  const checkUserAuth = useCallback(async () => {
    if (bootstrapRef.current) await bootstrapRef.current;
    await sessionRequest.current.settle();
    if (mountedRef.current) return checkAppState();
  }, [checkAppState]);

  /**
   * Centralized session expiration handler.
   * Called when a protected request fails due to an expired session.
   * Clears all authenticated state, hides protected data, and redirects.
   */
  const reportStartupFailure = useCallback((error) => {
    setStartupError({ type: error?.startupCode === 'TIMEOUT' ? 'timeout' : 'unreachable',
      code: startupErrorCode(error), status: requestStatus(error), startupCode: error?.startupCode });
    setIsLoadingAuth(false);
    setIsLoadingPublicSettings(false);
  }, []);

  const handleSessionExpired = useCallback((error) => {
    if (!confirmedSessionRejection(error)) { reportStartupFailure(error); return; }
    setSessionExpired(true);
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setStartupError(null);
    softNavigation('/login');
  }, [reportStartupFailure]);

  const logout = async (shouldRedirect = true, redirectTo = '/') => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    try {
      // Logout is deliberate, not recovery. Verify reachability before asking
      // the SDK to visit its official cookie-clearing logout endpoint.
      await withStartupSignal(async signal => {
        if (navigator.onLine === false) throw Object.assign(new Error('Offline'), { startupCode: 'OFFLINE' });
        const response = await fetch(`/api/apps/public/prod/public-settings/by-id/${appParams.appId}`, {
          signal, cache: 'no-store', redirect: 'error',
        });
        if (!response.ok) throw new Error('Logout unavailable');
      });
      if (navigator.onLine === false) throw new Error('Offline');
      performLocalLogout(shouldRedirect);
      lastVerifiedUserId = null;
      await base44.auth.logout(shouldRedirect ? redirectTo : undefined);
    } catch (error) {
      // Never navigate because the network or the logout request failed.
      reportStartupFailure(error);
    } finally {
      isLoggingOutRef.current = false;
    }
  };

  const navigateToLogin = () => softNavigation('/login');

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
      reportStartupFailure,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkSession,
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