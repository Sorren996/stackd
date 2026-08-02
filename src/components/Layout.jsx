import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Wind, Leaf, Waves, Settings, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import Dashboard from "../pages/Dashboard";
import HistoryPage from "../pages/History";
import CoachPage from "../pages/Coach";

const navItems = [
  { path: "/", label: "My Flow", icon: Wind },
  { path: "/history", label: "My Journal", icon: Leaf },
  { path: "/analytics", label: "My Rhythms", icon: Waves },
  { path: "/coach", label: "Coach", icon: Sparkles },
];

const CachedDashboard = memo(Dashboard);
const CachedHistoryPage = memo(HistoryPage);
const CachedCoachPage = memo(CoachPage);

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSettingsOpen = location.pathname.startsWith("/settings");
  const isDashboardRoute = location.pathname === "/";
  const isHistoryRoute = location.pathname === "/history";
  const isCoachRoute = location.pathname === "/coach";
  const isKeepAliveRoute = isDashboardRoute || isHistoryRoute || isCoachRoute;
  const [visitedTabs, setVisitedTabs] = useState(() => ({
    dashboard: true,
    history: false,
    coach: false,
  }));
  const [coachKeyboardOpen, setCoachKeyboardOpen] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => base44.entities.UserSettings.list("-created_date", 1),
    staleTime: 60 * 1000,
  });
  const notificationsEnabled = settings?.[0]?.coach_insight_notifications_enabled !== false;
  const { data: unreadInsights = [] } = useQuery({
    queryKey: ["unread-coach-insights"],
    queryFn: () => base44.entities.CoachInsight.filter({ status: "unread" }, "-generated_at", 10),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled: notificationsEnabled,
  });
  const hasUnread = notificationsEnabled && (unreadInsights || []).some(
    (insight) => !insight.expires_at || new Date(insight.expires_at).getTime() > Date.now()
  );

  useEffect(() => {
    const handler = (e) => setCoachKeyboardOpen(e.detail?.open ?? false);
    window.addEventListener("coach-keyboard-toggle", handler);
    return () => window.removeEventListener("coach-keyboard-toggle", handler);
  }, []);

  useEffect(() => {
    if (isDashboardRoute) {
      setVisitedTabs((tabs) => (tabs.dashboard ? tabs : { ...tabs, dashboard: true }));
    } else if (isHistoryRoute) {
      setVisitedTabs((tabs) => (tabs.history ? tabs : { ...tabs, history: true }));
    } else if (isCoachRoute) {
      setVisitedTabs((tabs) => (tabs.coach ? tabs : { ...tabs, coach: true }));
    }
  }, [isDashboardRoute, isHistoryRoute, isCoachRoute]);

  useEffect(() => {
    if (isSettingsOpen) {
      const overlay = document.getElementById("settings-overlay");
      if (overlay) overlay.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location.pathname]);

  const toggleSettings = () => {
    navigate(isSettingsOpen ? "/" : "/settings");
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
            onClick={() => navigate("/coach")}
            aria-label={hasUnread ? "AI Wellness Coach. New insight available." : "AI Wellness Coach. No new insights."}
            className="relative flex items-center justify-center rounded-full transition-all"
          >
            <img
              src="https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png"
              alt="Stackd Logo"
              className="h-9 w-auto object-contain transition-all duration-500"
              style={hasUnread ? { filter: "drop-shadow(0 0 6px rgba(251,191,36,0.85)) drop-shadow(0 0 14px rgba(251,191,36,0.4))" } : undefined}
            />
          </button>

          <div className="flex items-center justify-self-end gap-2">
            <button
              type="button"
              onClick={toggleSettings}
              aria-label="Open settings"
              className="flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm border transition-all"
              style={{
                background: isSettingsOpen ? "rgba(20,184,166,0.1)" : "rgba(255,255,255,0.05)",
                borderColor: isSettingsOpen ? "rgba(20,184,166,0.35)" : "rgba(255,255,255,0.05)",
                boxShadow: isSettingsOpen ? "0 0 18px rgba(20,184,166,0.35)" : "none",
              }}
            >
              <motion.span
                animate={{ rotate: isSettingsOpen ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="flex"
              >
                <Settings className={`h-4 w-4 ${isSettingsOpen ? "text-teal-400" : "text-white/55"}`} />
              </motion.span>
            </button>
          </div>
        </div>
      </header>

      <main className={`relative mx-auto w-full max-w-6xl px-4 pt-14 overflow-visible ${isCoachRoute ? "pb-0" : "pb-28"}`}>
        <div className="min-w-0 w-full">
          <div hidden={!isDashboardRoute}>
            <CachedDashboard />
          </div>
          {visitedTabs.history && (
            <div hidden={!isHistoryRoute}>
              <CachedHistoryPage />
            </div>
          )}
          {visitedTabs.coach && (
            <div hidden={!isCoachRoute}>
              <CachedCoachPage />
            </div>
          )}
          {!isKeepAliveRoute && !isSettingsOpen && (
            <Outlet />
          )}
        </div>
      </main>

      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            key="settings-overlay" id="settings-overlay"
            initial={{ y: "-100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 28 }}
            className="fixed inset-0 z-40 overflow-y-auto pb-28 pt-16"
            style={{
              background: "rgba(8,14,11,0.5)",
              backdropFilter: "blur(18px)",
            }}
          >
            <div className="px-4">
              <Outlet />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!coachKeyboardOpen && (
          <motion.nav
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-0 z-30 flex justify-center pb-safe"
          >
            <div
              className="relative mx-4 mb-4 grid w-[min(calc(100vw-2rem),28rem)] grid-cols-4 gap-1 overflow-hidden rounded-[2rem] border px-2 py-1.5 backdrop-blur-sm"
              style={{
                background: "rgba(255,255,255,0.22)",
                borderColor: "rgba(255,255,255,0.45)",
                boxShadow:
                  "0 18px 50px rgba(0,0,0,0.18), inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -1px 1px rgba(255,255,255,0.2)",
                backdropFilter: "blur(16px) saturate(140%)",
              }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-8 opacity-70"
                style={{
                  background:
                    "radial-gradient(circle at 25% 0%, rgba(255,255,255,0.26), transparent 34%), radial-gradient(circle at 85% 130%, rgba(45,212,191,0.16), transparent 42%)",
                }}
              />

              {navItems.map((item) => {
                const isActive = location.pathname === item.path && !isSettingsOpen;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-[1.55rem] px-2 py-2 text-center transition-colors ${
                      isActive ? "text-emerald-950" : "text-emerald-800 hover:text-emerald-950"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="active-nav-tab"
                        className="absolute inset-0 rounded-[1.55rem]"
                        style={{
                          background:
                            "linear-gradient(145deg, rgba(255,255,255,0.6), rgba(255,255,255,0.32))",
                          border: "1px solid rgba(255,255,255,0.7)",
                          boxShadow:
                            "0 10px 24px rgba(0,0,0,0.16), inset 0 1px 1px rgba(255,255,255,0.7), inset 0 -1px 1px rgba(255,255,255,0.25)",
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 460,
                          damping: 34,
                          mass: 0.8,
                        }}
                      />
                    )}

                    <motion.span
                      className="relative z-10 flex items-center justify-center"
                      animate={{
                        y: isActive ? -1 : 0,
                        scale: isActive ? 1.07 : 1,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 28,
                      }}
                    >
                      <Icon className="h-5 w-5" />
                    </motion.span>

                    <motion.span
                      className="relative z-10 whitespace-nowrap text-[10px] font-semibold leading-none"
                      animate={{
                        opacity: isActive ? 1 : 0.64,
                        y: isActive ? 0 : 1,
                      }}
                      transition={{ duration: 0.16 }}
                    >
                      {item.label}
                    </motion.span>
                  </Link>
                );
              })}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}