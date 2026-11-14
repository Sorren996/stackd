import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { queryClientInstance, setOnAuthFailure } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ParallaxBackground from './components/ParallaxBackground';
import NavigationHistoryProvider from '@/components/navigation/NavigationHistoryProvider';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Mfa from '@/pages/Mfa';
import Landing from './pages/Landing';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import FollowerLayout from '@/components/follower/FollowerLayout';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
import { Navigate } from 'react-router-dom';
import SplashScreen from "@/components/SplashScreen";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import RequiredAcknowledgments from "@/pages/RequiredAcknowledgments";
import Onboarding from "@/pages/Onboarding";
import ErrorBoundary from "@/components/ErrorBoundary";
import RouteFallback from "@/components/RouteFallback";
// Route-level chunks: everything whose only purpose is a report, a form or a
// sub-page. Auth, the startup gates, the shells and Home stay eager above.
import {
  LazyHistory, LazyAnalytics, LazySettings, LazyInsights,
  LazyInsulinSettings, LazyProfileSettings, LazyPrivacyConsent,
  LazyDisplaySettings, LazyDexcomSettings, LazySensorSession, LazyManualGlucose,
  LazySharing, LazyNotifications, LazyReminders, LazyContactSupport, LazySupportInbox,
  LazySplitPlanReview, LazyFollowingHome, LazyFollowerSettings,
  LazyFollowInvite, LazyInstall, LazyPrivacy, LazyTerms, LazyPublicContact,
  LazyHowItWorks, LazySharingExplained,
} from '@/routes/lazyPages';

// A lazily loaded screen keeps the shell around it: the fallback reserves the
// page's height and paints nothing, so a first visit never flashes or jumps.
const page = (element) => <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
import { ACKNOWLEDGMENT_VERSIONS, CHECKBOX_KEYS } from "@/lib/acknowledgmentConfig";
import { cacheSettingsLocally } from "@/lib/userSettings";
import { loadStartupSetup } from '@/lib/startupSetup';
import useStartupRecovery from '@/hooks/useStartupRecovery';
import useBootStatus from '@/hooks/useBootStatus';
import { confirmedSessionRejection } from '@/lib/startupRequest';
import {
  logStartup,
  startupErrorCode,
} from "@/lib/startupDiagnostics";
import StartupRecovery from "@/components/StartupRecovery";
import useAccessProfile from "@/hooks/useAccessProfile";
import { acknowledgmentKey, onboardingKey, loadAcknowledgments, retryConsent, requestStatus } from '@/lib/consentStartup';

const AuthenticatedApp = () => {
  const {
    user,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    navigateToLogin,
    isAuthenticated,
    handleSessionExpired,
    reportStartupFailure,
    startupError,
    retryStartup,
    checkSession,
  } = useAuth();
  const [preparedSetup, setPreparedSetup] = useState(null);

  // What this account IS — resolved server-side from invitation and
  // relationship data before any patient gate or patient query runs. Someone
  // who only follows another person is a viewer, and never mounts the patient
  // acknowledgments, set-up, dashboard or logging UI.
  const profile = useAccessProfile();
  const profileSettled = profile.resolved || Boolean(profile.error);
  const viewerMode = profileSettled && profile.mode === "follower";

  // A capability check that never resolved is recorded once, by code only.
  const profileErrorLogged = useRef(false);
  useEffect(() => {
    if (profile.error && !profileErrorLogged.current) {
      profileErrorLogged.current = true;
      logStartup("profile", { outcome: "error", code: "PROFILE_UNRESOLVED" });
    }
  }, [profile.error]);

  // An independent operation (including notifications) cannot declare the
  // whole session expired. Only a rejection from auth.me establishes that.
  useEffect(() => {
    let active = true;
    let checking = false;
    setOnAuthFailure(async () => {
      if (checking || !user?.id) return;
      checking = true;
      try {
        const current = await checkSession();
        if (active && current?.id !== user.id) await retryStartup();
      } catch (error) {
        if (!active) return;
        if (confirmedSessionRejection(error)) handleSessionExpired(error);
        else reportStartupFailure(error);
      } finally {
        checking = false;
      }
    });
    return () => { active = false; setOnAuthFailure(null); };
  }, [user?.id, handleSessionExpired, reportStartupFailure, retryStartup, checkSession]);

  const {
    data: latestAck,
    isLoading: ackLoading,
    isError: ackError,
    isSuccess: ackSuccess,
    error: ackFailure,
    isFetching: ackFetching,
    refetch: refetchAcknowledgment,
  } = useQuery({
    queryKey: acknowledgmentKey(user?.id),
    queryFn: ({ signal }) => loadAcknowledgments(base44, user.id, 1, signal),
    enabled: isAuthenticated && Boolean(user?.id) && !isLoadingAuth && profile.resolved && !profile.error && !viewerMode,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    refetchOnReconnect: false,
    networkMode: 'always',
    retry: retryConsent,
  });



  const needsAcknowledgment = useMemo(() => {
    // A viewer is not a patient. The medical acknowledgments are never applied
    // to them, and nothing is ever recorded as accepted on their behalf.
    if (viewerMode) return false;
    if (!isAuthenticated || isLoadingAuth || ackLoading || ackError || !ackSuccess) return null;

    if (user?.required_reconsent) return true;
    if (!user?.health_data_consent_active) return true;
    if (user?.current_acknowledgment_bundle_version !== ACKNOWLEDGMENT_VERSIONS.acknowledgment_bundle_version) return true;
    if (!user?.required_acknowledgments_complete) return true;

    if (!latestAck?.length) return true;
    const record = latestAck[0];
    if (record.withdrawn_at) return true;

    for (const [key, value] of Object.entries(ACKNOWLEDGMENT_VERSIONS)) {
      if (record[key] !== value) return true;
    }

    if (CHECKBOX_KEYS.some((flag) => !record[flag])) return true;

    return false;
  }, [user, latestAck, isAuthenticated, isLoadingAuth, ackLoading, ackError, ackSuccess, viewerMode]);

  // Read-only setup check, only after authoritative role and consent resolution.
  const {
    data: onboardingData,
    isLoading: onboardingChecking,
    isError: onboardingError,
    error: onboardingFailure,
    isFetching: onboardingFetching,
    refetch: refetchOnboarding,
  } = useQuery({
    queryKey: onboardingKey(user?.id),
    queryFn: ({ signal }) => loadStartupSetup(base44, user.id, signal),
    enabled: isAuthenticated && Boolean(user?.id) && !isLoadingAuth && profile.resolved && !profile.error && ackSuccess && !ackError && needsAcknowledgment === false && !viewerMode,
    staleTime: Infinity,
    refetchOnReconnect: false,
    networkMode: 'always',
    retry: false,
  });

  useEffect(() => {
    if (!user?.id || !onboardingData || onboardingError || needsAcknowledgment !== false || !profile.resolved || viewerMode) return;
    if (preparedSetup?.userId === user.id && preparedSetup?.data === onboardingData) return;
    // Hydrate once per startup snapshot; later profile/consent checks must not
    // overwrite settings the person has since edited in the working view.
    const cachedSettings = queryClientInstance.getQueryState(['user-settings']);
    const setupSnapshot = queryClientInstance.getQueryState(onboardingKey(user.id));
    const settings = cachedSettings?.data && cachedSettings.dataUpdatedAt > (setupSnapshot?.dataUpdatedAt || 0)
      ? cachedSettings.data : onboardingData.settings;
    queryClientInstance.setQueryData(['user-settings'], settings);
    try {
      cacheSettingsLocally(user.id, { ...settings,
        settings_confirmed: settings?.settings_confirmed === true,
        onboarding_completed: settings?.onboarding_completed === true });
      // Preserve the existing non-blocking timezone sync used by background notices.
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (settings?.id && browserTz && settings.timezone !== browserTz) {
        base44.entities.UserSettings.update(settings.id, { timezone: browserTz }).catch(() => {});
      }
      window.dispatchEvent(new Event('target-range-updated'));
      window.dispatchEvent(new Event('insulin-settings-updated'));
    } catch { /* Device storage is not the server's setup result. */ }
    setPreparedSetup({ userId: user.id, data: onboardingData });
  }, [user?.id, onboardingData, onboardingError, needsAcknowledgment, profile.resolved, viewerMode, preparedSetup]);

  const failedStage = startupError ? 'auth' : profile.error ? 'profile' : ackError ? 'consent' : onboardingError ? 'setup' : null;
  const recoveryError = failedStage === 'auth' ? startupError : failedStage === 'profile' ? profile.error : failedStage === 'consent' ? ackFailure : failedStage === 'setup' ? onboardingFailure : null;
  const recovery = useStartupRecovery(`${user?.id || 'anon'}:${failedStage}`, recoveryError, () => {
    if (failedStage === 'auth') return retryStartup();
    if (failedStage === 'profile') return profile.refetch({ cancelRefetch: false });
    if (failedStage === 'consent') return refetchAcknowledgment({ cancelRefetch: false });
    if (failedStage === 'setup') return refetchOnboarding({ cancelRefetch: false });
  });

  const bootStage = failedStage ? null : isLoadingAuth || isLoadingPublicSettings ? 'auth'
    : profile.resolving ? 'profile' : !isAuthenticated || viewerMode ? null
    : ackLoading ? 'consent' : needsAcknowledgment ? null
    : needsAcknowledgment == null || onboardingChecking || onboardingData == null
      || preparedSetup?.userId !== user?.id || preparedSetup?.data !== onboardingData ? 'setup' : null;
  useBootStatus(bootStage);
  useEffect(() => {
    window.__stackdRetryStartup = () => {
      const work = failedStage ? recovery.retryNow() : window.__stackdRestartBoot?.();
      Promise.resolve(work).catch(() => window.__stackdBoot?.networkError());
    };
    return () => { delete window.__stackdRetryStartup; };
  }, [failedStage, recovery.retryNow]);

  // Still checking auth, or still resolving what this account is. A neutral
  // splash — never a patient empty state for someone who only follows along.
  // Every step behind this splash is bounded, so it cannot spin forever.
  if (!startupError && (isLoadingPublicSettings || isLoadingAuth || profile.resolving)) {
    return (
      <AnimatePresence>
        <SplashScreen />
      </AnimatePresence>
    );
  }

  // A launch step did not answer inside its deadline. A calm bounded state with
  // an explicit Retry: nothing is claimed as signed in, and a network blip
  // never silently signs anyone out.
  if (startupError) {
    return (
      <StartupRecovery
        title={
          startupError.type === "timeout"
            ? "This is taking longer than usual"
            : "We could not reach Stackd just now"
        }
        message="Your data is safe. Check your connection, then try again."
        onRetry={recovery.retryNow}
        retrying={recovery.busy || isLoadingAuth || isLoadingPublicSettings}

      />
    );
  }

  // User not registered for this app
  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  // Not authenticated — show auth pages or splash with login/register actions
  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/mfa" element={<Mfa />} />
        <Route path="/" element={<Landing />} />
        <Route path="/install" element={page(<LazyInstall />)} />
        <Route path="/privacy" element={page(<LazyPrivacy />)} />
        <Route path="/terms" element={page(<LazyTerms />)} />
        <Route path="/contact" element={page(<LazyPublicContact />)} />
        <Route path="/how-it-works" element={page(<LazyHowItWorks />)} />
        <Route path="/sharing" element={page(<LazySharingExplained />)} />
        <Route path="/follow" element={page(<LazyFollowInvite />)} />
        <Route path="*" element={<SplashScreen showAuth />} />
      </Routes>
    );
  }

  // Authenticated — render the app shell immediately so the user never stares
  // at a blank teal screen on revisit. The shell (header, nav, card
  // structure) paints now and data fills in as the prefetch resolves. Only
  // the acknowledgment flow is gated on the ack record loading, so we briefly
  // hold the splash until the ack check has resolved (it's a tiny list call).
  // A viewer gets the follower shell: following on the home screen, a bar with
  // no logging action, and no patient set-up or acknowledgments anywhere.
  // What this account is could not be confirmed. Nothing is guessed in either
  // direction: a follower is never asked to accept a patient's medical notices,
  // and a patient's own dashboard is never hidden, because a guess is not made
  // at all. One press retries.
  if (profile.error) {
    return (
      <StartupRecovery
        title="We could not confirm your account set-up"
        message="Your data is safe. Check your connection, then try again."
        onRetry={recovery.retryNow}
        retrying={profile.isFetching || recovery.busy}
      />
    );
  }

  if (viewerMode) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route element={<FollowerLayout />}>
            <Route path="/" element={<LazyFollowingHome />} />
            <Route path="/following/settings" element={<LazyFollowerSettings />} />
            <Route path="/following/notifications" element={<LazyNotifications variant="follower" />} />
            {/* Kept so an existing bookmark still lands on something real. */}
            <Route path="/shared" element={<LazyFollowingHome />} />
            <Route path="/follow" element={<LazyFollowInvite />} />
          </Route>
          <Route path="/install" element={page(<LazyInstall />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    );
  }

  if (ackLoading) {
    return (
      <AnimatePresence>
        <SplashScreen />
      </AnimatePresence>
    );
  }

  // The consent record could not be read. That is not "no consent given", so
  // nobody is asked to accept anything again because of a network blip — and
  // nothing is ever recorded as accepted on their behalf either.
  if (ackError) {
    return (
      <StartupRecovery
        title="We could not confirm your account status"
        message="Nothing has changed on your account. Try again in a moment."
        onRetry={recovery.retryNow}
        retrying={ackFetching || recovery.busy}
      />
    );
  }

  // Acknowledgment flow required
  if (needsAcknowledgment) {
    return <RequiredAcknowledgments />;
  }

  // Onboarding walkthrough — only for new users who haven't completed it.
  // A failed check is not "onboarding required": it is reported with Retry.
  if (onboardingError) {
    return (
      <StartupRecovery
        title="We could not finish checking your set-up"
        message="Nothing has changed on your account. Try again in a moment."
        onRetry={recovery.retryNow}
        retrying={onboardingFetching || recovery.busy}
      />
    );
  }

  if (needsAcknowledgment == null || onboardingChecking || onboardingData == null || preparedSetup?.userId !== user?.id || preparedSetup?.data !== onboardingData) {
    return (
      <AnimatePresence>
        <SplashScreen />
      </AnimatePresence>
    );
  }

  if (onboardingData?.needsOnboarding) {
    return <Onboarding />;
  }

  // Render the main app
  return (
    <>
      <ErrorBoundary>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<LazyHistory />} />
            <Route element={<AdminRoute />}>
              <Route path="/insights" element={<LazyInsights />} />
            </Route>
            <Route path="/analytics" element={<LazyAnalytics />} />
            <Route path="/settings" element={<LazySettings />} />
            <Route path="/settings/insulin" element={<LazyInsulinSettings />} />
            <Route path="/settings/profile" element={<LazyProfileSettings />} />
            <Route path="/settings/privacy-consent" element={<LazyPrivacyConsent />} />
            <Route path="/settings/display" element={<LazyDisplaySettings />} />
            <Route path="/settings/dexcom" element={<LazyDexcomSettings />} />
            <Route path="/settings/sensor" element={<LazySensorSession />} />
            <Route path="/settings/manual-glucose" element={<LazyManualGlucose />} />
            <Route path="/settings/sharing" element={<LazySharing />} />
            <Route path="/settings/notifications" element={<LazyNotifications />} />
            <Route path="/settings/reminders" element={<LazyReminders />} />
            {/* The earlier placement. Kept as a redirect so no bookmark dangles. */}
            <Route path="/settings/notifications/reminders" element={<Navigate to="/settings/reminders" replace />} />
            <Route path="/shared" element={<LazyFollowingHome />} />
            <Route path="/follow" element={<LazyFollowInvite />} />
            <Route path="/settings/contact-support" element={<LazyContactSupport />} />
            <Route path="/settings/support-inbox" element={<LazySupportInbox />} />
            <Route path="/split-plan/:planId" element={<LazySplitPlanReview />} />
          </Route>
          <Route path="/install" element={page(<LazyInstall />)} />
          <Route path="/privacy" element={page(<LazyPrivacy />)} />
          <Route path="/terms" element={page(<LazyTerms />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </>
  );
};


// Belt-and-braces for iOS: the same guard on the app shell, so a long press
// anywhere inside the app can never open the native copy/look-up menu. Fields
// keep theirs, so editing and correcting text is unaffected.
function blockNativeContextMenu(event) {
  const target = event.target;
  if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
  event.preventDefault();
}

function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <div onContextMenu={blockNativeContextMenu}>
            <ScrollToTop />
            <ParallaxBackground />
            {/* Records the app's own history entries so every page-level Back
                arrow returns to the page the person actually came from. */}
            <NavigationHistoryProvider>
              <AuthenticatedApp />
            </NavigationHistoryProvider>
          </div>
        </Router>
        <Toaster />
        {/* Position and safe-area offset live in the component itself, so no
            caller can drop a banner back onto the status bar. */}
        <SonnerToaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App