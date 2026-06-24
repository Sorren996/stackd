import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Activity, History, BarChart2, Settings, Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SettingsContent from "../pages/Settings";

const navItems = [
  { path: "/", label: "Dashboard", icon: Activity },
  { path: "/history", label: "History", icon: History },
  { path: "/analytics", label: "Analytics", icon: BarChart2 },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSettingsOpen = location.pathname === "/settings";
  const [isLightMode, setIsLightMode] = useState(() => localStorage.getItem("theme") === "light");

  useEffect(() => {
    localStorage.setItem("theme", isLightMode ? "light" : "dark");
  }, [isLightMode]);

  const toggleSettings = () => {
    navigate(isSettingsOpen ? "/" : "/settings");
  };

  const pageText = isLightMode ? "text-zinc-900" : "text-white";
  const mutedText = isLightMode ? "text-zinc-500" : "text-white/50";

  return (
    <div className={`relative min-h-screen overflow-x-hidden transition-colors duration-500 ${pageText} ${isLightMode ? "app-light" : "app-dark"}`}>
      {isLightMode && (
        <style>{`
          .app-light [class~="text-white"] {
            color: #29433a !important;
          }

          .app-light [class*="text-white/"] {
            color: rgba(41, 67, 58, 0.6) !important;
          }

          .app-light [class*="border-white"] {
            border-color: rgba(32, 51, 45, 0.13) !important;
          }

          .app-light [class*="bg-white/"] {
            background-color: rgba(255, 255, 255, 0.62) !important;
          }

          .app-light label {
            color: #29433a !important;
          }

          .app-light [class*="text-teal-"] {
            color: #237b70 !important;
          }

          .app-light [class*="text-orange-"],
          .app-light [class*="text-amber-"] {
            color: #a96821 !important;
          }

          .app-light [class*="text-red-"] {
            color: #b35b5d !important;
          }

          .app-light [class*="text-blue-"] {
            color: #4a78a5 !important;
          }

          .app-light [class*="bg-teal-"] {
            background-color: rgba(35, 123, 112, 0.1) !important;
          }

          .app-light [class*="bg-amber-"],
          .app-light [class*="bg-orange-"] {
            background-color: rgba(169, 104, 33, 0.1) !important;
          }

          .app-light [class*="bg-red-"] {
            background-color: rgba(179, 91, 93, 0.1) !important;
          }

          .app-light .metric-card,
          .app-light .dashboard-surface {
            background: linear-gradient(145deg, rgba(255,255,255,0.92), rgba(237,247,243,0.72)) !important;
            border-color: rgba(32, 90, 76, 0.15) !important;
            box-shadow: 0 14px 34px rgba(31, 70, 59, 0.08), inset 0 1px 0 rgba(255,255,255,0.88) !important;
          }

          .app-light .active-alert-row {
            background: rgba(255,255,255,0.68) !important;
            border-color: rgba(32, 90, 76, 0.13) !important;
            box-shadow: 0 8px 22px rgba(31, 70, 59, 0.05), inset 0 1px 0 rgba(255,255,255,0.9);
          }

          .app-light .theme-popover {
            background: rgba(255,255,255,0.96) !important;
            border-color: rgba(32, 90, 76, 0.16) !important;
            box-shadow: 0 18px 48px rgba(31, 70, 59, 0.16) !important;
          }

          .app-light .balance-sparkline line {
            stroke: rgba(32, 51, 45, 0.18) !important;
          }
        `}</style>
      )}
      <div
        className="pointer-events-none fixed inset-0 -z-50 transition-colors duration-500"
        style={{
          background: isLightMode
            ? "linear-gradient(to bottom, #fbfdfc, #eef6f3, #dceae5)"
            : "linear-gradient(to bottom, #042f2e, #18181b, #000000)",
        }}
      />

      <header className="sticky top-0 z-50 bg-transparent">
        <div
          className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4"
          style={{
            background: isLightMode
              ? "linear-gradient(to bottom, rgba(255,255,255,0.92), rgba(255,255,255,0.45), transparent)"
              : "linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4), transparent)",
          }}
        >
          <div className="w-9" />
          <img
            src="https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png"
            alt="Stackd Logo"
            className="h-9 w-auto object-contain"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsLightMode((value) => !value)}
              aria-label={isLightMode ? "Switch to dark mode" : "Switch to light mode"}
              title={isLightMode ? "Switch to dark mode" : "Switch to light mode"}
              className="flex h-9 w-9 items-center justify-center rounded-full border transition-all"
              style={{
                background: isLightMode ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.05)",
                borderColor: isLightMode ? "rgba(234,179,8,0.45)" : "rgba(255,255,255,0.08)",
                boxShadow: isLightMode ? "0 0 16px rgba(234,179,8,0.3)" : "none",
              }}
            >
              <motion.span
                key={isLightMode ? "sun" : "moon"}
                initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="flex"
              >
                {isLightMode ? (
                  <Sun className="h-4 w-4 text-amber-500" />
                ) : (
                  <Moon className="h-4 w-4 text-white/60" />
                )}
              </motion.span>
            </button>

            <button
              type="button"
              onClick={toggleSettings}
              aria-label="Open settings"
              className="flex h-9 w-9 items-center justify-center rounded-full border transition-all"
              style={{
                background: isSettingsOpen ? "rgba(20,184,166,0.1)" : isLightMode ? "rgba(24,24,27,0.06)" : "rgba(255,255,255,0.05)",
                borderColor: isSettingsOpen ? "rgba(20,184,166,0.35)" : isLightMode ? "rgba(24,24,27,0.1)" : "rgba(255,255,255,0.05)",
                boxShadow: isSettingsOpen ? "0 0 18px rgba(20,184,166,0.35)" : "none",
              }}
            >
              <motion.span
                animate={{ rotate: isSettingsOpen ? 180 : 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="flex"
              >
                <Settings className={`h-4 w-4 ${isSettingsOpen ? "text-teal-400" : mutedText}`} />
              </motion.span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-28 pt-0">
        <div className="min-w-0 w-full">
          <Outlet />
        </div>
      </main>

      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            key="settings-overlay"
            initial={{ y: "-100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 28 }}
            className="fixed inset-0 z-40 overflow-y-auto pb-28 pt-16"
            style={{
              background: isLightMode ? "rgba(250,250,250,0.97)" : "rgba(8,14,11,0.97)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div className="px-4">
              <SettingsContent />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-center pb-safe">
        <div
          className="mx-4 mb-4 flex items-center gap-1 rounded-3xl border px-4 py-1 backdrop-blur-sm"
          style={{
            background: isLightMode ? "rgba(255,255,255,0.72)" : "rgba(8,14,10,0.4)",
            borderColor: isLightMode ? "rgba(24,24,27,0.15)" : "rgba(255,255,255,0.4)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          {navItems.map((item) => {
            const isActive = location.pathname === item.path && !isSettingsOpen;
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative flex flex-col items-center gap-1 rounded-2xl px-4 py-1.5 transition-colors ${
                  isActive ? (isLightMode ? "text-zinc-900" : "text-white") : isLightMode ? "text-zinc-500 hover:text-zinc-900" : "text-white/40 hover:text-white/70"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav-tab"
                    className="absolute inset-0 -z-10 rounded-2xl"
                    style={{ background: isLightMode ? "rgba(24,24,27,0.08)" : "rgba(255,255,255,0.15)" }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon className="relative z-10 h-5 w-5" />
                <span className="relative z-10 text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
