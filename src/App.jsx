import { useState, useEffect, useMemo } from "react";
import { Toaster } from "@/components/ui/toaster"
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
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import InsulinSettingsPage from './pages/InsulinSettingsPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import PrivacyConsentPage from './pages/PrivacyConsentPage';
import DisplaySettingsPage from './pages/DisplaySettingsPage';
import DexcomSettingsPage from './pages/DexcomSettingsPage';
import ContactSupportPage from './pages/ContactSupportPage';
import SupportInbox from './pages/SupportInbox';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
import SplashScreen from "@/components/SplashScreen";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import RequiredAcknowledgments from "@/pages/RequiredAcknowledgments";
import SplitPlanReview from "@/pages/SplitPlanReview";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ACKNOWLEDGMENT_VERSIONS, CHECKBOX_KEYS } from "@/lib/acknowledgmentConfig";
import { loadUserSettings, migrateLocalSettingsIfNeeded, cacheSettingsLocally } from "@/lib/userSettings";

const AuthenticatedApp = () => {
  const { user, isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated, handleSessionExpired } = useAuth();
  const [dataReady, setDataReady] = useState(false);
  const [graphReady, setGraphReady] = useState(false);

  useEffect(() => {
    const handler = () => setGraphReady(true);
    window.addEventListener("dashboard-graph-ready", handler);
    return () => window.removeEventListener("dashboard-graph-ready", handler);
  }, []);

  // Safety fallback: never trap the user behind the splash if the graph
  // signal never arrives (e.g. landing on a non-dashboard route).
  useEffect(() => {
    if (!dataReady || graphReady) return;
    const id = setTimeout(() => setGraphReady(true), 5000);
    return () => clearTimeout(id);
  }, [dataReady, graphReady]);

  // Wire global auth-failure handler so any 401/403 during a query or mutation
  // triggers the centralized session-expiration flow.
  useEffect(() => {
    setOnAuthFailure(() => {
      queryClientInstance.clear();
      handleSessionExpired();
    });
    return () => setOnAuthFailure(null);
  }, [handleSessionExpired]);

  const { data: latestAck, isLoading: ackLoading } = useQuery({
    queryKey: ["latest-acknowledgment"],
    queryFn: () => base44.entities.UserAcknowledgment.list("-accepted_at", 1),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isAuthenticated || authError) {
      setDataReady(false);
      return;
    }

    let cancelled = false;
    const prefetchData = async () => {
      // Background prefetch for secondary pages — fired without awaiting so
      // the splash can dismiss as soon as the Dashboard data is ready.
      queryClientInstance
        .prefetchQuery({
          queryKey: ["history-summary"],
          queryFn: async () => {
            const res = await base44.functions.invoke("getHistorySummary", {
              tzOffsetMinutes: new Date().getTimezoneOffset(),
            });
            return res.data;
          },
        })
        .catch(() => {});

      await Promise.all([
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
          queryKey: ["insulin-doses"],
          queryFn: () => base44.entities.InsulinDose.list("-administered_at", 200),
        }),
        queryClientInstance.prefetchQuery({
          queryKey: ["latest-glucose"],
          queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 1),
        }),
        queryClientInstance.prefetchQuery({
          queryKey: ["glucose-readings", "graph"],
          queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 5000),
        }),
        queryClientInstance.prefetchQuery({
          queryKey: ["glucose-readings"],
          queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 1000),
        }),
        queryClientInstance.prefetchQuery({
          queryKey: ["carb-entries"],
          queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 300),
        }),
        queryClientInstance.prefetchQuery({
          queryKey: ["carb-entries", "graph"],
          queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 1000),
        }),
        queryClientInstance.prefetchQuery({
          queryKey: ["insulin-doses", "graph"],
          queryFn: () => base44.entities.InsulinDose.list("-administered_at", 1000),
        }),
        queryClientInstance.prefetchQuery({
          queryKey: ["split-plans"],
          queryFn: () => base44.entities.SplitDosePlan.list("-created_date", 20),
        }),
      ]);

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

      if (!cancelled) {
        setDataReady(true);

        // Prefetch the Rhythms (analytics) glucose window in the background so
        // the page opens with its data already warm — no loading spinner on
        // entry. Fired after the Dashboard data so the main page loads first.
        queryClientInstance
          .prefetchQuery({
            queryKey: ["glucose-readings", "analytics"],
            queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 30000),
          })
          .catch(() => {});
      }
    };
    prefetchData();
    return () => { cancelled = true; };
  }, [isAuthenticated, authError]);

  const needsAcknowledgment = useMemo(() => {
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
  }, [user, latestAck, isAuthenticated, dataReady, ackLoading]);

  // Still checking auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <AnimatePresence>
        <SplashScreen />
      </AnimatePresence>
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
        <Route path="*" element={<SplashScreen showAuth />} />
      </Routes>
    );
  }

  // Authenticated — wait for data prefetch and acknowledgment check
  if (!dataReady || ackLoading) {
    return (
      <AnimatePresence>
        <SplashScreen />
      </AnimatePresence>
    );
  }

  // Acknowledgment flow required
  if (needsAcknowledgment) {
    return <RequiredAcknowledgments />;
  }

  // Render the main app
  return (
    <>
      <ErrorBoundary>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/insulin" element={<InsulinSettingsPage />} />
            <Route path="/settings/profile" element={<ProfileSettingsPage />} />
            <Route path="/settings/privacy-consent" element={<PrivacyConsentPage />} />
            <Route path="/settings/display" element={<DisplaySettingsPage />} />
            <Route path="/settings/dexcom" element={<DexcomSettingsPage />} />
            <Route path="/settings/contact-support" element={<ContactSupportPage />} />
            <Route path="/settings/support-inbox" element={<SupportInbox />} />
            <Route path="/split-plan/:planId" element={<SplitPlanReview />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
      <AnimatePresence>
        {!graphReady && <SplashScreen />}
      </AnimatePresence>
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
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App