import { useState, useEffect, useMemo } from "react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
import SplashScreen from "@/components/SplashScreen";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import RequiredAcknowledgments from "@/pages/RequiredAcknowledgments";
import { ACKNOWLEDGMENT_VERSIONS, CHECKBOX_KEYS } from "@/lib/acknowledgmentConfig";

const AuthenticatedApp = () => {
  const { user, isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated } = useAuth();
  const [dataReady, setDataReady] = useState(false);

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
      await Promise.all([
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
      ]);
      if (!cancelled) setDataReady(true);
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
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/history" element={<History />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App