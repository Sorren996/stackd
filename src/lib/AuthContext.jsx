import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { clearLocalSettingsCache, ensureLocalCacheOwnedBy } from '@/lib/userSettings';

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
  const logoutChannelRef = useRef(null);
  const isLoggingOutRef = useRef(false);

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

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token,
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({ type: 'auth_required', message: 'Authentication required' });
          } else if (reason === 'user_not_registered') {
            setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
          } else {
            setAuthError({ type: reason, message: appError.message });
          }
        } else {
          setAuthError({ type: 'unknown', message: appError.message || 'Failed to load app' });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      setAuthError({ type: 'unknown', message: error.message || 'An unexpected error occurred' });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      // On a shared device, wipe the previous account's cached settings and
      // latest glucose before this session starts so no data crosses accounts.
      ensureLocalCacheOwnedBy(currentUser.id);
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setUser(null);
      setAuthChecked(true);
      
      // Session expired or invalid — clear stale local state
      if (error.status === 401 || error.status === 403) {
        clearLocalSettingsCache();
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    }
  };

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