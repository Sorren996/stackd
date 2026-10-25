import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Home, BarChart3, BookOpen, CircleUser, Plus, Droplets, Syringe, Utensils } from "lucide-react";
import LogInsulinForm from "@/components/forms/LogInsulinForm";
import LogMealForm from "@/components/forms/LogMealForm";
import LogGlucoseForm from "@/components/forms/LogGlucoseForm";
import LogInsulinMealForm from "@/components/forms/LogInsulinMealForm";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import NavItem from "@/components/nav/NavItem";
import NavLabel from "@/components/nav/NavLabel";
import LogFanMenu from "@/components/nav/LogFanMenu";
import NavNotchSurface, { useMeasuredWidth } from "@/components/nav/NavNotchSurface";
import {
  BAR_HEIGHT,
  BAR_PADDING_X,
  LOG_LAYER_BOTTOM,
  LOG_RAISE,
  LOG_RING,
  LOG_SIZE,
  SIDE_INSET,
} from "@/components/nav/navGeometry";

const EASE_OUT = [0.16, 1, 0.3, 1];

// Four destinations with the primary Log action between them.
// `key` values are unchanged from the previous bar, so each tab's saved
// sub-path (Journal month/day, Settings sub-page) still restores exactly.
const navItems = [
  { key: "dashboard", path: "/", label: "Home", Icon: Home },
  { key: "analytics", path: "/analytics", label: "Insights", Icon: BarChart3 },
  { key: "history", path: "/history", label: "Journal", Icon: BookOpen },
  { key: "settings", path: "/settings", label: "Profile", Icon: CircleUser },
];

const SUBPATH_KEY = (key) => `stackd-tab-subpath:${key}`;

function readSavedSubpath(key) {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return null;
  try {
    const v = sessionStorage.getItem(SUBPATH_KEY(key));
    return v && v !== "/" ? v : null;
  } catch {
    return null;
  }
}

function saveSubpath(key, pathname) {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SUBPATH_KEY(key), pathname || "/");
  } catch {
    // Session storage may be unavailable (private mode) — navigate still works.
  }
}

function readManualGlucoseEnabled() {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem("manual_glucose_logging_enabled");
  return raw === null ? true : raw === "true";
}

export default function UnifiedBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const activeIndex = (() => {
    if (location.pathname.startsWith("/settings")) return 3;
    const idx = navItems.findIndex((it) => it.path === location.pathname);
    return idx === -1 ? 0 : idx;
  })();
  const isNavMatch = (() => {
    if (location.pathname.startsWith("/settings")) return true;
    return navItems.some((it) => it.path === location.pathname);
  })();
  const activeTabKey = navItems[activeIndex]?.key || "dashboard";

  // The bar's own width drives the contour path, so the notch stays centred.
  const [barRef, barWidth] = useMeasuredWidth();

  const [expanded, setExpanded] = useState(false);
  const [selectedMode, setSelectedMode] = useState(null);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const [doseFormPreloaded, setDoseFormPreloaded] = useState(false);
  const [combinedSheetOpen, setCombinedSheetOpen] = useState(false);
  const [manualGlucoseEnabled, setManualGlucoseEnabled] = useState(readManualGlucoseEnabled);
  const { connected: dexcomConnected } = useDexcomConnection();

  // Fanned options, ordered left (Glucose) → centre (Insulin) → right (Carbs).
  // Glucose stays gated exactly as before: hidden when manual logging is off,
  // or when a CGM is already supplying readings.
  const actions = useMemo(() => {
    const list = [
      { id: "insulin", label: "Insulin", Icon: Syringe, mode: "insulin" },
      { id: "carbs", label: "Carbs", Icon: Utensils, mode: "carbs" },
    ];
    if (manualGlucoseEnabled && !dexcomConnected) {
      list.unshift({ id: "glucose", label: "Glucose", Icon: Droplets, mode: "glucose" });
    }
    return list;
  }, [manualGlucoseEnabled, dexcomConnected]);

  useEffect(() => {
    setExpanded(false);
  }, [location.pathname]);

  // Persist the active sub-path of each tab so switching back restores the
  // exact screen the user was on (Journal month/day/recap, etc.).
  useEffect(() => {
    if (!isNavMatch) return;
    saveSubpath(activeTabKey, `${location.pathname}${location.search}`);
  }, [activeTabKey, location.pathname, location.search, isNavMatch]);

  const handleTabPress = (e, item) => {
    const alreadyActive = item.key === activeTabKey;
    if (alreadyActive) {
      e.preventDefault();
      if (location.pathname !== item.path) navigate(item.path);
      return;
    }
    const saved = readSavedSubpath(item.key);
    e.preventDefault();
    navigate(saved || item.path);
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refresh = () => setManualGlucoseEnabled(readManualGlucoseEnabled());
    window.addEventListener("insulin-settings-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("insulin-settings-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Preload the DoseForm sheet on idle so it opens instantly on tap.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const preload = () => setDoseFormPreloaded(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preload, 350);
    return () => window.clearTimeout(id);
  }, []);

  // Allow other parts of the app to open a logging sheet directly, or to open
  // the fan itself.
  useEffect(() => {
    const handler = (e) => {
      const mode = e?.detail?.mode;
      if (!mode) return;
      setExpanded(false);
      if (mode === "both") {
        setCombinedSheetOpen(true);
      } else {
        setSelectedMode(mode);
        setDoseFormPreloaded(true);
        setDoseFormOpen(true);
      }
    };
    window.addEventListener("stackd-open-log", handler);
    const menuHandler = () => setExpanded(true);
    window.addEventListener("stackd-open-log-menu", menuHandler);
    return () => {
      window.removeEventListener("stackd-open-log", handler);
      window.removeEventListener("stackd-open-log-menu", menuHandler);
    };
  }, []);

  const openAction = useCallback((mode) => {
    setExpanded(false);
    if (mode === "both") {
      setCombinedSheetOpen(true);
      return;
    }
    setSelectedMode(mode);
    setDoseFormPreloaded(true);
    setDoseFormOpen(true);
  }, []);

  const togglePill = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const closeFan = useCallback(() => setExpanded(false), []);

  // Escape closes the fan.
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Lock background scroll while the fan is open (no sheet mounted yet).
  useEffect(() => {
    if (!expanded || doseFormOpen || combinedSheetOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded, doseFormOpen, combinedSheetOpen]);

  const stackVisible = expanded && !doseFormOpen && !combinedSheetOpen;

  return (
    <>
      {(doseFormPreloaded || doseFormOpen) && selectedMode === "insulin" && (
        <LogInsulinForm open={doseFormOpen} onClose={() => setDoseFormOpen(false)} />
      )}
      {(doseFormPreloaded || doseFormOpen) && selectedMode === "carbs" && (
        <LogMealForm open={doseFormOpen} onClose={() => setDoseFormOpen(false)} />
      )}
      {(doseFormPreloaded || doseFormOpen) && selectedMode === "glucose" && (
        <LogGlucoseForm open={doseFormOpen} onClose={() => setDoseFormOpen(false)} />
      )}

      {combinedSheetOpen && (
        <LogInsulinMealForm open={combinedSheetOpen} onClose={() => setCombinedSheetOpen(false)} />
      )}

      {/* Page dimming only. It sits below both the bar and the Log layer, so it
          darkens the page behind the bar without tinting or washing out the bar,
          the button, the discs or their labels. */}
      <AnimatePresence>
        {stackVisible && (
          <motion.div
            key="scrim"
            aria-hidden="true"
            className="fixed inset-0"
            style={{ background: "rgba(63,56,48,0.32)", zIndex: 40 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={closeFan}
          />
        )}
      </AnimatePresence>

      {/* ── The bar: contour, four destinations, and the Log label ── */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0"
        style={{
          bottom: "calc(0px + env(safe-area-inset-bottom))",
          paddingLeft: SIDE_INSET,
          paddingRight: SIDE_INSET,
          zIndex: 50,
        }}
      >
        <div
          ref={barRef}
          className="relative mx-auto w-full overflow-visible"
          style={{ maxWidth: "30rem", height: BAR_HEIGHT }}
        >
          <NavNotchSurface width={barWidth} />

          {/* One shared grid: five equally sized slots. The four destinations keep
              identical spacing, and the Log label sits in the centre slot on the
              same baseline as theirs. The notch's widest point (±33px at the top
              edge, 23px once the icon row starts) stays inside the centre slot,
              so it never reaches a neighbouring icon or label. */}
          <div
            className="relative grid"
            style={{
              height: BAR_HEIGHT,
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              paddingLeft: BAR_PADDING_X,
              paddingRight: BAR_PADDING_X,
              paddingBottom: 4,
              zIndex: 51,
            }}
          >
            {navItems.slice(0, 2).map((item) => (
              <NavItem
                key={item.path}
                item={item}
                active={navItems.indexOf(item) === activeIndex}
                onPress={(e) => handleTabPress(e, item)}
              />
            ))}

            {/* Centre slot — the Log label only. The FAB floats above it in its
                own layer, so this slot is a label, never a destination. */}
            <div
              className="flex h-full min-w-0 flex-col items-center justify-end gap-[3px]"
              aria-hidden="true"
            >
              <NavLabel color="var(--nav-label)">Log</NavLabel>
              <span style={{ width: 16, height: 2 }} />
            </div>

            {navItems.slice(2).map((item) => (
              <NavItem
                key={item.path}
                item={item}
                active={navItems.indexOf(item) === activeIndex}
                onPress={(e) => handleTabPress(e, item)}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* ── Log button + fanned options ──
          Its own fixed layer: above the bar, below the modal sheets (z 70/90).
          The layer is anchored to the BUTTON's bottom edge with the raise
          reserved as padding, so its box always contains the whole raised
          button and the button always lands centred on the notch. */}
      <div
        className="pointer-events-none fixed inset-x-0"
        style={{
          bottom: `calc(${LOG_LAYER_BOTTOM}px + env(safe-area-inset-bottom))`,
          paddingTop: LOG_RAISE,
          paddingLeft: SIDE_INSET,
          paddingRight: SIDE_INSET,
          zIndex: 54,
        }}
      >
        {/* Centred on the bar's centre line — directly under the notch. */}
        <div className="pointer-events-auto relative mx-auto" style={{ width: LOG_SIZE, height: LOG_SIZE }}>
          <LogFanMenu
            open={stackVisible}
            actions={actions}
            onSelect={openAction}
            onClose={closeFan}
            reduce={reduce}
          />

          <motion.button
            type="button"
            onClick={togglePill}
            aria-label={expanded ? "Close log menu" : "Log"}
            aria-expanded={expanded}
            className="absolute left-0 top-0 flex items-center justify-center rounded-full"
            style={{
              width: LOG_SIZE,
              height: LOG_SIZE,
              background: "linear-gradient(180deg, #ab5c2d 0%, #9c5228 58%, #8a4720 100%)",
              border: "1px solid rgba(63,56,48,0.20)",
              boxShadow: `0 0 0 ${LOG_RING}px var(--nav-ring), 0 8px 20px rgba(63,56,48,0.30)`,
              color: "#fdf9f2",
              zIndex: 53,
            }}
            whileTap={reduce ? undefined : { scale: 0.94 }}
          >
            <motion.span
              className="flex items-center justify-center"
              animate={{ rotate: expanded ? 45 : 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
            >
              <Plus className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
            </motion.span>
          </motion.button>
        </div>
      </div>
    </>
  );
}