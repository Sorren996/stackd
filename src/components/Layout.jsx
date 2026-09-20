import { memo, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Check, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Dashboard from "../pages/Dashboard";
import HistoryPage from "../pages/History";
import SettingsPage from "../pages/Settings";
import AnalyticsPage from "../pages/Analytics";
import ThemeToggle from "./ThemeToggle";
import UnifiedBottomNav from "./UnifiedBottomNav";
import { useRealtimeLogSync } from "@/hooks/useRealtimeLogSync";

const CachedDashboard = memo(Dashboard);
const CachedHistoryPage = memo(HistoryPage);
const CachedSettingsPage = memo(SettingsPage);
const CachedAnalyticsPage = memo(AnalyticsPage);

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSettingsRoute = location.pathname === "/settings";
  const isDashboardRoute = location.pathname === "/";
  const isHistoryRoute = location.pathname === "/history";
  const isAnalyticsRoute = location.pathname === "/analytics";
  const isKeepAliveRoute = isDashboardRoute || isHistoryRoute || isAnalyticsRoute || isSettingsRoute;
  const [visitedTabs, setVisitedTabs] = useState(() => ({
    dashboard: true,
    history: true,
    analytics: true,
    settings: true,
  }));

  // Keeps every page's cached log data fresh the instant a record changes —
  // including Dexcom syncs that land while the user is on Journal/Rhythms.
  useRealtimeLogSync();

  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshAlert, setRefreshAlert] = useState(null);

  // Re-pulls the latest information from the database for every cached query,
  // without kicking off the external Dexcom Share poll.
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    let timeoutId;
    let sawError = false;
    // Watch the query cache for any failed refetch during this refresh so a
    // second tap (while still offline) is still reported as unsuccessful —
    // inspecting final query status alone is racy because a refetch clears
    // the previous error state to "pending" before it fails again.
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action?.type !== "error") return;
      if (event.query?.queryKey[0] === "dexcom-poll-now") return;
      sawError = true;
    });
    try {
      const refreshPromise = queryClient.refetchQueries({
        predicate: (query) => query.queryKey[0] !== "dexcom-poll-now",
      });
      // Guard against a hung connection — if the refetch can't establish a
      // connection, time out and surface the unsuccessful alert instead of
      // spinning forever.
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("refresh-timeout")), 3000);
      });
      await Promise.race([refreshPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      // Use three independent signals so an offline refresh can never report a
      // false success: error events during the refresh, the browser's own
      // connectivity flag, and any query left in an error state afterward.
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const hasErrorQuery = queryClient.getQueryCache().getAll().some(
        (q) => q.queryKey[0] !== "dexcom-poll-now" && q.state.status === "error"
      );
      setRefreshAlert({ type: sawError || offline || hasErrorQuery ? "error" : "success" });
    } catch {
      clearTimeout(timeoutId);
      setRefreshAlert({ type: "error" });
    } finally {
      unsubscribe();
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!refreshAlert) return;
    const id = setTimeout(() => setRefreshAlert(null), 2500);
    return () => clearTimeout(id);
  }, [refreshAlert]);

  useEffect(() => {
    if (isDashboardRoute) {
      setVisitedTabs((tabs) => (tabs.dashboard ? tabs : { ...tabs, dashboard: true }));
    } else if (isHistoryRoute) {
      setVisitedTabs((tabs) => (tabs.history ? tabs : { ...tabs, history: true }));
    } else if (isAnalyticsRoute) {
      setVisitedTabs((tabs) => (tabs.analytics ? tabs : { ...tabs, analytics: true }));
    } else if (isSettingsRoute) {
      setVisitedTabs((tabs) => (tabs.settings ? tabs : { ...tabs, settings: true }));
    }
  }, [isDashboardRoute, isHistoryRoute, isAnalyticsRoute, isSettingsRoute]);

  const handleLogoClick = () => {
    navigate("/");
  };

  return (
    <div className="isolate relative min-h-screen overflow-x-hidden text-white">
      <header className="fixed inset-x-0 top-0 z-50 bg-transparent">
        <div
          className="mx-auto grid h-14 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0.25), transparent)",
          }}
        >
          <div />
          <button
            type="button"
            onClick={handleLogoClick}
            aria-label="Stackd home"
            className="relative flex items-center justify-center rounded-full transition-all"
          >
            <motion.img
              src="https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png"
              alt="Stackd Logo"
              className="relative z-10 h-9 w-auto object-contain"
            />
          </button>

          <div className="flex items-center justify-self-end gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh information"
              className="stackd-top-control flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm border transition-all"
              style={{
                background: "rgba(255,255,255,0.05)",
                borderColor: "rgba(255,255,255,0.05)",
              }}
            >
              <motion.span
                animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
                transition={
                  isRefreshing
                    ? { duration: 0.8, repeat: Infinity, ease: "linear" }
                    : { duration: 0.2 }
                }
                className="flex"
              >
                <RefreshCw className="h-4 w-4 text-white/55" />
              </motion.span>
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {refreshAlert && (
          <motion.div
            key="refresh-alert"
            initial={{ opacity: 0, x: "-50%", y: -10, scale: 0.96 }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={{ opacity: 0, x: "-50%", y: -10, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed left-1/2 top-16 z-[60] flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur-md"
            style={
              refreshAlert.type === "success"
                ? {
                    background: "linear-gradient(145deg, rgba(91,168,138,0.24), rgba(91,168,138,0.10))",
                    borderColor: "rgba(91,168,138,0.42)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 0 18px rgba(91,168,138,0.18)",
                  }
                : {
                    background: "linear-gradient(145deg, rgba(217,169,56,0.24), rgba(217,169,56,0.10))",
                    borderColor: "rgba(217,169,56,0.42)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 0 18px rgba(217,169,56,0.18)",
                  }
            }
          >
            {refreshAlert.type === "success" ? (
              <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(120,200,170,0.95)" }} />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(230,190,110,0.95)" }} />
            )}
            <span
              className="whitespace-nowrap text-xs font-semibold"
              style={{ color: refreshAlert.type === "success" ? "rgba(190,232,212,0.96)" : "rgba(244,214,150,0.96)" }}
            >
              {refreshAlert.type === "success" ? "Refreshed with the latest" : "Refresh unsuccessful — please try again"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <main
        className="relative mx-auto w-full max-w-6xl px-4 overflow-visible pb-28"
        style={{ paddingTop: "3.5rem" }}
      >
        <div className="min-w-0 w-full">
          <div hidden={!isDashboardRoute}>
            <CachedDashboard />
          </div>
          {visitedTabs.history && (
            <div hidden={!isHistoryRoute}>
              <CachedHistoryPage />
            </div>
          )}
          {visitedTabs.analytics && (
            <div hidden={!isAnalyticsRoute}>
              <CachedAnalyticsPage />
            </div>
          )}
          {visitedTabs.settings && (
            <div hidden={!isSettingsRoute}>
              <CachedSettingsPage />
            </div>
          )}
          {!isKeepAliveRoute && <Outlet />}
        </div>
      </main>

      <UnifiedBottomNav />
    </div>
  );
}