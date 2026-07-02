import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
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

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated } = useAuth();
  const [dataReady, setDataReady] = useState(false);

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
          queryFn: () => base44.entities.InsulinDose.list("-administered_at", 100),
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
          queryKey: ["carb-entries"],
          queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 100),
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

  const showSplash = !authError && (isLoadingPublicSettings || isLoadingAuth || (isAuthenticated && !dataReady));

  if (showSplash) {
    return (
      <AnimatePresence>
        <SplashScreen />
      </AnimatePresence>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
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