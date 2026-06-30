import { useEffect, useMemo, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Activity, History, BarChart2, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SettingsContent from "../pages/Settings";

const LATEST_GLUCOSE_CACHE_KEY = "latest_glucose_cache";

const navItems = [
  { path: "/", label: "Dashboard", icon: Activity },
  { path: "/history", label: "History", icon: History },
  { path: "/analytics", label: "Analytics", icon: BarChart2 },
];

function readCachedLatestGlucose() {
  if (typeof window === "undefined") return null;

  try {
    const cached = window.localStorage.getItem(LATEST_GLUCOSE_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function getGlucoseValue(reading) {
  const value = Number(reading?.value ?? reading?.glucose ?? reading?.glucose_value ?? reading?.mg_dl ?? reading?.mgdl ?? reading?.mg_dL);
  return Number.isFinite(value) ? value : null;
}

function getGlucoseBackgroundColor(reading) {
  const value = getGlucoseValue(reading);
  if (value === null) return "#042f2e";
  if (value < 70) return "#102a5c";
  if (value > 180) return "#5a2a10";
  return "#063f36";
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSettingsOpen = location.pathname === "/settings";
  const [latestGlucose, setLatestGlucose] = useState(readCachedLatestGlucose);
  const appBackground = useMemo(() => {
    const primaryColor = getGlucoseBackgroundColor(latestGlucose);
    return `linear-gradient(to bottom, ${primaryColor} 0%, #18181b 52%, #000000 100%)`;
  }, [latestGlucose]);
  const [backgroundLayers, setBackgroundLayers] = useState(() => ({
    current: appBackground,
    previous: null,
    key: 0,
  }));

  useEffect(() => {
    const updateLatestGlucose = () => setLatestGlucose(readCachedLatestGlucose());

    window.addEventListener("latest-glucose-updated", updateLatestGlucose);
    window.addEventListener("storage", updateLatestGlucose);

    return () => {
      window.removeEventListener("latest-glucose-updated", updateLatestGlucose);
      window.removeEventListener("storage", updateLatestGlucose);
    };
  }, []);

  useEffect(() => {
    setBackgroundLayers((layers) => {
      if (layers.current === appBackground) return layers;

      return {
        current: appBackground,
        previous: layers.current,
        key: layers.key + 1,
      };
    });
  }, [appBackground]);

  const toggleSettings = () => {
    navigate(isSettingsOpen ? "/" : "/settings");
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-50 overflow-hidden"
      >
        {backgroundLayers.previous && (
          <motion.div
            key={`previous-${backgroundLayers.key}`}
            className="absolute inset-0"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.8, ease: "easeInOut" }}
            style={{ background: backgroundLayers.previous }}
            onAnimationComplete={() => {
              setBackgroundLayers((layers) =>
                layers.key === backgroundLayers.key ? { ...layers, previous: null } : layers
              );
            }}
          />
        )}
        <motion.div
          key={`current-${backgroundLayers.key}`}
          className="absolute inset-0"
          initial={{ opacity: backgroundLayers.previous ? 0 : 1 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
          style={{ background: backgroundLayers.current }}
        />
      </div>

      <header className="fixed inset-x-0 top-0 z-50 bg-transparent">
        <div
          className="mx-auto grid h-14 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4), transparent)",
          }}
        >
          <div />
          <img
            src="https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png"
            alt="Stackd Logo"
            className="h-9 w-auto object-contain"
          />

          <div className="flex items-center justify-self-end gap-2">
            <button
              type="button"
              onClick={toggleSettings}
              aria-label="Open settings"
              className="flex h-9 w-9 items-center justify-center rounded-full border transition-all"
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
                <Settings className={`h-4 w-4 ${isSettingsOpen ? "text-teal-400" : "text-white/50"}`} />
              </motion.span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-28 pt-14 overflow-visible">
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
              background: "rgba(8,14,11,0.97)",
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
          className="relative mx-4 mb-4 flex items-center gap-1 overflow-hidden rounded-[2rem] border px-2 py-1.5 backdrop-blur-sm"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))",
            borderColor: "rgba(255,255,255,0.24)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.38), inset 0 1px 1px rgba(255,255,255,0.32), inset 0 -1px 1px rgba(255,255,255,0.08)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-8 opacity-70"
            style={{
              background: "radial-gradient(circle at 25% 0%, rgba(255,255,255,0.26), transparent 34%), radial-gradient(circle at 85% 130%, rgba(45,212,191,0.16), transparent 42%)",
            }}
          />
          {navItems.map((item) => {
            const isActive = location.pathname === item.path && !isSettingsOpen;
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative flex min-w-[72px] flex-col items-center gap-1 rounded-[1.55rem] px-3 py-2 transition-colors ${
                  isActive ? "text-white" : "text-white/45 hover:text-white/75"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav-tab"
                    className="absolute inset-0 rounded-[1.55rem]"
                    style={{
                      background: "linear-gradient(145deg, rgba(255,255,255,0.28), rgba(255,255,255,0.09))",
                      border: "1px solid rgba(255,255,255,0.34)",
                      boxShadow: "0 10px 24px rgba(0,0,0,0.22), inset 0 1px 1px rgba(255,255,255,0.38), inset 0 -1px 1px rgba(255,255,255,0.1)",
                    }}
                    transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.8 }}
                  />
                )}
                <motion.span
                  className="relative z-10 flex"
                  animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.07 : 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28 }}
                >
                  <Icon className="h-5 w-5" />
                </motion.span>
                <motion.span
                  className="relative z-10 text-[10px] font-semibold"
                  animate={{ opacity: isActive ? 1 : 0.64, y: isActive ? 0 : 1 }}
                  transition={{ duration: 0.16 }}
                >
                  {item.label}
                </motion.span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
