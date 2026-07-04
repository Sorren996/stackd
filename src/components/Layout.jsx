import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Wind, Leaf, Waves, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SettingsContent from "../pages/Settings";
import Dashboard from "../pages/Dashboard";
import HistoryPage from "../pages/History";

const LATEST_GLUCOSE_CACHE_KEY = "latest_glucose_cache";

const navItems = [
  { path: "/", label: "My Flow", icon: Wind },
  { path: "/history", label: "My Journal", icon: Leaf },
  { path: "/analytics", label: "My Rhythms", icon: Waves },
];

const CachedDashboard = memo(Dashboard);
const CachedHistoryPage = memo(HistoryPage);

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

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };

  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);

  return {
    low: Number.isFinite(low) ? low : 70,
    high: Number.isFinite(high) ? high : 180,
  };
}

const SCENE_IMAGES = {
  high: "https://res.cloudinary.com/bzqjmwln/image/upload/v1782928032/mountain_gxgmap.png",
  range: "https://res.cloudinary.com/bzqjmwln/image/upload/v1783094100/01e40410-8011-4b5c-a610-c19ed5209481_jdz8wn.png",
  low: "https://res.cloudinary.com/bzqjmwln/image/upload/v1782928032/valley_vqpesd.png",
};

function getGlucoseScene(reading, targetRange) {
  const value = getGlucoseValue(reading);
  if (value === null) return "range";
  if (value < targetRange.low) return "low";
  if (value > targetRange.high) return "high";
  return "range";
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSettingsOpen = location.pathname === "/settings";
  const isDashboardRoute = location.pathname === "/";
  const isHistoryRoute = location.pathname === "/history";
  const isKeepAliveRoute = isDashboardRoute || isHistoryRoute;
  const [visitedTabs, setVisitedTabs] = useState(() => ({
    dashboard: true,
    history: false,
  }));
  const [latestGlucose, setLatestGlucose] = useState(readCachedLatestGlucose);
  const [targetRange, setTargetRange] = useState(readTargetRange);
  const sceneStatus = useMemo(() => getGlucoseScene(latestGlucose, targetRange), [latestGlucose, targetRange]);
  const sceneRef = useRef(null);

  useEffect(() => {
    const updateLatestGlucose = () => setLatestGlucose(readCachedLatestGlucose());
    const updateTargetRange = () => setTargetRange(readTargetRange());

    window.addEventListener("latest-glucose-updated", updateLatestGlucose);
    window.addEventListener("target-range-updated", updateTargetRange);
    window.addEventListener("storage", updateLatestGlucose);
    window.addEventListener("storage", updateTargetRange);

    return () => {
      window.removeEventListener("latest-glucose-updated", updateLatestGlucose);
      window.removeEventListener("target-range-updated", updateTargetRange);
      window.removeEventListener("storage", updateLatestGlucose);
      window.removeEventListener("storage", updateTargetRange);
    };
  }, []);

  useEffect(() => {
    if (isDashboardRoute) {
      setVisitedTabs((tabs) => (tabs.dashboard ? tabs : { ...tabs, dashboard: true }));
    } else if (isHistoryRoute) {
      setVisitedTabs((tabs) => (tabs.history ? tabs : { ...tabs, history: true }));
    }
  }, [isDashboardRoute, isHistoryRoute]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let frame = 0;
    let currentOffset = 0;
    let targetOffset = 0;

    const updateSceneOffset = () => {
      frame = 0;

      if (!sceneRef.current) return;

      // Lerp toward target for buttery-smooth parallax — no stutter
      currentOffset += (targetOffset - currentOffset) * 0.18;

      if (Math.abs(targetOffset - currentOffset) < 0.15) {
        currentOffset = targetOffset;
        sceneRef.current.style.transform = `translate3d(0, ${currentOffset}px, 0)`;
        return;
      }

      sceneRef.current.style.transform = `translate3d(0, ${currentOffset}px, 0)`;
      frame = window.requestAnimationFrame(updateSceneOffset);
    };

    const handleScroll = () => {
      targetOffset = Math.max(-160, Math.min(0, window.scrollY * -0.12));
      if (frame) return;
      frame = window.requestAnimationFrame(updateSceneOffset);
    };

    // Set initial position without animation
    targetOffset = Math.max(-160, Math.min(0, window.scrollY * -0.12));
    currentOffset = targetOffset;
    if (sceneRef.current) {
      sceneRef.current.style.transform = `translate3d(0, ${currentOffset}px, 0)`;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const toggleSettings = () => {
    navigate(isSettingsOpen ? "/" : "/settings");
  };

  return (
    <div className="isolate relative min-h-screen overflow-x-hidden bg-black text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20 bg-black"
      />

      <div
        ref={sceneRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[120vh] overflow-hidden bg-black"
        style={{ transform: "translate3d(0, 0, 0)", willChange: "transform" }}
      >
        <AnimatePresence initial={false}>
          <motion.img
            key={sceneStatus}
            src={SCENE_IMAGES[sceneStatus]}
            alt=""
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 0.82, scale: 1.03 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
            className="absolute inset-x-0 top-0 h-[130vh] w-full max-w-none object-cover"
            style={{
              filter: "grayscale(0.04) saturate(1.12) contrast(1.02) brightness(1.12)",
              objectPosition: sceneStatus === "high" ? "center top" : sceneStatus === "low" ? "center 35%" : "center top",
              transformOrigin: "center top",
              WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 70%, rgba(0,0,0,0.9) 100%)",
              maskImage: "linear-gradient(to bottom, black 0%, black 70%, rgba(0,0,0,0.9) 100%)",
            }}
          />
        </AnimatePresence>
        <div className="absolute inset-0 bg-black/25" />
        <div
          className="absolute inset-x-0 bottom-0 h-[38vh]"
          style={{
            background: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.28) 42%, rgba(0,0,0,0.72) 78%, #000000 100%)",
          }}
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
                <Settings className={`h-4 w-4 ${isSettingsOpen ? "text-teal-400" : "text-white/50"}`} />
              </motion.span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-4 pb-28 pt-14 overflow-visible">
        <div className="min-w-0 w-full">
          <div hidden={!isDashboardRoute}>
            <CachedDashboard />
          </div>
          {visitedTabs.history && (
            <div hidden={!isHistoryRoute}>
              <CachedHistoryPage />
            </div>
          )}
          {!isKeepAliveRoute && (
            <Outlet />
          )}
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
    className="relative mx-4 mb-4 grid w-[min(calc(100vw-2rem),22rem)] grid-cols-3 gap-1 overflow-hidden rounded-[2rem] border px-2 py-1.5 backdrop-blur-sm"
    style={{
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))",
      borderColor: "rgba(255,255,255,0.24)",
      boxShadow:
        "0 18px 50px rgba(0,0,0,0.38), inset 0 1px 1px rgba(255,255,255,0.32), inset 0 -1px 1px rgba(255,255,255,0.08)",
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
            isActive ? "text-white" : "text-white/45 hover:text-white/75"
          }`}
        >
          {isActive && (
            <motion.div
              layoutId="active-nav-tab"
              className="absolute inset-0 rounded-[1.55rem]"
              style={{
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.28), rgba(255,255,255,0.09))",
                border: "1px solid rgba(255,255,255,0.34)",
                boxShadow:
                  "0 10px 24px rgba(0,0,0,0.22), inset 0 1px 1px rgba(255,255,255,0.38), inset 0 -1px 1px rgba(255,255,255,0.1)",
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
</nav>
    </div>
  );
}