import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Landing from './pages/Landing';
import Install from './pages/Install';
import PrivacyPage from './pages/PrivacyPage';
import PublicContactPage from './pages/PublicContactPage';
import HowItWorks from './pages/HowItWorks';
import SharingExplained from './pages/SharingExplained';
import TermsPage from './pages/TermsPage';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Insights from './pages/Insights';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import InsulinSettingsPage from './pages/InsulinSettingsPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import PrivacyConsentPage from './pages/PrivacyConsentPage';
import DisplaySettingsPage from './pages/DisplaySettingsPage';
import SupportCreatorPage from './pages/SupportCreatorPage';
import DexcomSettingsPage from './pages/DexcomSettingsPage';
import SharingPage from './pages/SharingPage';
import NotificationsPage from './pages/NotificationsPage';
import FollowingHome from './pages/FollowingHome';
import FollowerSettings from './pages/FollowerSettings';
import FollowerLayout from '@/components/follower/FollowerLayout';
import FollowInvite from './pages/FollowInvite';
import ContactSupportPage from './pages/ContactSupportPage';
import SupportInbox from './pages/SupportInbox';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
import { Navigate } from 'react-router-dom';
import SplashScreen from "@/components/SplashScreen";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import RequiredAcknowledgments from "@/pages/RequiredAcknowledgments";
import Onboarding from "@/pages/Onboarding";
import SplitPlanReview from "@/pages/SplitPlanReview";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ACKNOWLEDGMENT_VERSIONS, CHECKBOX_KEYS } from "@/lib/acknowledgmentConfig";
import { loadUserSettings, migrateLocalSettingsIfNeeded, cacheSettingsLocally } from "@/lib/userSettings";
import {
  STARTUP_DATA_DEADLINE_MS,
  logStartup,
  startupErrorCode,
  withStartupDeadline,
} from "@/lib/startupDiagnostics";
import StartupRecovery from "@/components/StartupRecovery";
import useAccessProfile from "@/hooks/useAccessProfile";

const AuthenticatedApp = () => {
  const {
    user,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    navigateToLogin,
    isAuthenticated,
    handleSessionExpired,
    startupError,
    retryStartup,
  } = useAuth();
  const [dataReady, setDataReady] = useState(false);
  const [retryingSurfaces, setRetryingSurfaces] = useState(false);

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

  // Wire global auth-failure handler so any 401/403 during a query or mutation
  // triggers the centralized session-expiration flow.
  useEffect(() => {
    setOnAuthFailure(() => {
      queryClientInstance.clear();
      handleSessionExpired();
    });
    return () => setOnAuthFailure(null);
  }, [handleSessionExpired]);

  const {
    data: latestAck,
    isLoading: ackLoading,
    isError: ackError,
  } = useQuery({
    queryKey: ["latest-acknowledgment"],
    queryFn: () => base44.entities.UserAcknowledgment.list("-accepted_at", 1),
    enabled: isAuthenticated && profileSettled && !viewerMode,
  });

  useEffect(() => {
    // Hold every patient read until the capability is known, so a viewer's
    // device never starts fetching a patient set it will not use.
    if (!isAuthenticated || authError || !profileSettled || viewerMode) {
      setDataReady(false);
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    // Only the two things the shell itself needs block the launch: the person's
    // own settings (the confirmed-plan gate reads them) and the newest saved
    // reading. Everything larger — graph history, meal and dose history,
    // split plans, analytics and history summaries — is left to the page that
    // asks for it, at its own exact ranges, so the shell never waits on
    // thousands of rows and no history is truncated.
    //
    // The wait is bounded: a slow or unanswered settings read cannot hold the
    // splash open, and a failure is reported, never mistaken for "no records".
    const criticalWarmup = Promise.allSettled([
      queryClientInstance.prefetchQuery({
        queryKey: ["user-settings"],
        queryFn: async () => {
          try {
            await migrateLocalSettingsIfNeeded();
          } catch {
            // Migration failure is non-fatal
          }
          return loadUserSettings();
        },
      }),
      queryClientInstance.prefetchQuery({
        queryKey: ["latest-glucose"],
        queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 1),
      }),
    ]);

    withStartupDeadline(criticalWarmup, STARTUP_DATA_DEADLINE_MS)
      .catch((error) => {
        logStartup("data", {
          outcome: "error",
          code: startupErrorCode(error),
          durationMs: Date.now() - startedAt,
        });
      })
      .finally(() => {
        if (cancelled) return;

        // Cache user settings into localStorage so all pages (Dashboard,
        // ActiveInsulinBanner, etc.) can read them immediately on login.
        try {
          const settings = queryClientInstance.getQueryData(["user-settings"]);
          if (settings && user?.id) {
            cacheSettingsLocally(user.id, settings);
            // Save the browser timezone so the AI Coach can reference local times.
            const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (browserTz && settings.timezone !== browserTz) {
              base44.entities.UserSettings.update(settings.id, { timezone: browserTz }).catch(() => {});
            }
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("target-range-updated"));
              window.dispatchEvent(new Event("insulin-settings-updated"));
            }
          }
        } catch {
          // Settings cache failure is non-fatal — don't block the app.
        }

        logStartup("data", { durationMs: Date.now() - startedAt });
        setDataReady(true);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, authError, profileSettled, viewerMode]);

  const needsAcknowledgment = useMemo(() => {
    // A viewer is not a patient. The medical acknowledgments are never applied
    // to them, and nothing is ever recorded as accepted on their behalf.
    if (viewerMode) return false;
    if (!isAuthenticated || !dataReady || ackLoading) return null;

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
  }, [user, latestAck, isAuthenticated, dataReady, ackLoading, viewerMode]);

  // Onboarding check — only runs after acknowledgment is complete.
  // Existing accounts (with any health data) are auto-marked as onboarded.
  const {
    data: onboardingData,
    isLoading: onboardingChecking,
    isError: onboardingError,
  } = useQuery({
    queryKey: ["onboarding-check"],
    queryFn: async () => {
      const settings = queryClientInstance.getQueryData(["user-settings"]);
      if (settings?.onboarding_completed === true) return { needsOnboarding: false };

      // Check for existing health data — existing users skip onboarding.
      const [readings, carbs, doses] = await Promise.all([
        base44.entities.GlucoseReading.list("-created_date", 1),
        base44.entities.CarbEntry.list("-created_date", 1),
        base44.entities.InsulinDose.list("-created_date", 1),
      ]);

      const hasData = (readings?.length > 0) || (carbs?.length > 0) || (doses?.length > 0);
      if (hasData) {
        if (settings?.id) {
          await base44.entities.UserSettings.update(settings.id, { onboarding_completed: true }).catch(() => {});
        }
        await queryClientInstance.invalidateQueries({ queryKey: ["user-settings"] });
        return { needsOnboarding: false };
      }

      return { needsOnboarding: true };
    },
    enabled: needsAcknowledgment === false && !viewerMode,
    staleTime: 0,
  });

  // Explicit, manual retry for the account surfaces. Nothing here reloads the
  // app on its own — one press, one attempt.
  const retryAccountSurfaces = useCallback(() => {
    setRetryingSurfaces(true);
    Promise.allSettled([
      queryClientInstance.invalidateQueries({ queryKey: ["latest-acknowledgment"] }),
      queryClientInstance.invalidateQueries({ queryKey: ["onboarding-check"] }),
      queryClientInstance.invalidateQueries({ queryKey: ["user-settings"] }),
      queryClientInstance.invalidateQueries({ queryKey: ["access-profile"] }),
    ]).finally(() => setRetryingSurfaces(false));
  }, []);

  // Still checking auth, or still resolving what this account is. A neutral
  // splash — never a patient empty state for someone who only follows along.
  // Every step behind this splash is bounded, so it cannot spin forever.
  if (isLoadingPublicSettings || isLoadingAuth || profile.resolving) {
    return (
      <AnimatePresence>
        <SplashScreen />
      </AnimatePresence>
    );
  }

  // A launch step did not answer inside its deadline. A calm bounded state with
  // an explicit Retry: nothing is claimed as signed in, and a network blip
  // never silently signs anyone out.
  if (startupError && !isAuthenticated) {
    return (
      <StartupRecovery
        title={
          startupError.type === "timeout"
            ? "This is taking longer than usual"
            : "We could not reach Stackd just now"
        }
        message="Your data is safe. Check your connection, then try again."
        onRetry={retryStartup}
        retrying={isLoadingAuth || isLoadingPublicSettings}
        showSignIn
        onSignIn={() => { window.location.href = "/login"; }}
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
        <Route path="/" element={<Landing />} />
        <Route path="/install" element={<Install />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/contact" element={<PublicContactPage />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/sharing" element={<SharingExplained />} />
        <Route path="/follow" element={<FollowInvite />} />
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
        onRetry={() => {
          profile.refetch();
          retryAccountSurfaces();
        }}
        retrying={profile.isFetching || retryingSurfaces}
      />
    );
  }

  if (viewerMode) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route element={<FollowerLayout />}>
            <Route path="/" element={<FollowingHome />} />
            <Route path="/following/settings" element={<FollowerSettings />} />
            <Route path="/following/notifications" element={<NotificationsPage variant="follower" />} />
            {/* Kept so an existing bookmark still lands on something real. */}
            <Route path="/shared" element={<FollowingHome />} />
            <Route path="/follow" element={<FollowInvite />} />
          </Route>
          <Route path="/install" element={<Install />} />
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
        onRetry={retryAccountSurfaces}
        retrying={retryingSurfaces}
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
        onRetry={retryAccountSurfaces}
        retrying={retryingSurfaces}
      />
    );
  }

  if (onboardingChecking || onboardingData == null) {
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
            <Route path="/history" element={<History />} />
            <Route element={<AdminRoute />}>
              <Route path="/insights" element={<Insights />} />
            </Route>
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/insulin" element={<InsulinSettingsPage />} />
            <Route path="/settings/profile" element={<ProfileSettingsPage />} />
            <Route path="/settings/privacy-consent" element={<PrivacyConsentPage />} />
            <Route path="/settings/display" element={<DisplaySettingsPage />} />
            <Route path="/settings/support-creator" element={<SupportCreatorPage />} />
            <Route path="/settings/dexcom" element={<DexcomSettingsPage />} />
            <Route path="/settings/sharing" element={<SharingPage />} />
            <Route path="/settings/notifications" element={<NotificationsPage />} />
            <Route path="/shared" element={<FollowingHome />} />
            <Route path="/follow" element={<FollowInvite />} />
            <Route path="/settings/contact-support" element={<ContactSupportPage />} />
            <Route path="/settings/support-inbox" element={<SupportInbox />} />
            <Route path="/split-plan/:planId" element={<SplitPlanReview />} />
          </Route>
          <Route path="/install" element={<Install />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <ParallaxBackground />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <SonnerToaster position="top-center" theme="light" />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App