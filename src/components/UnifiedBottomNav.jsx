import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, animate } from "framer-motion";
import { Home, BookOpen, Activity, CircleUser, Plus, X, Droplets, Wheat, Syringe } from "lucide-react";
import LogInsulinForm from "@/components/forms/LogInsulinForm";
import LogMealForm from "@/components/forms/LogMealForm";
import LogGlucoseForm from "@/components/forms/LogGlucoseForm";
import LogInsulinMealForm from "@/components/forms/LogInsulinMealForm";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";

// ── Design tokens (cream cards, copper accent, espresso ink) ─────────────
const INK = "#3f3830";
const COPPER = "#9c5228";
const TAUPE = "#6b6153";
const FAINT = "#746959"; // ≥ 4.5:1 on cream — AA compliant for labels
const CREAM = "#fdf9f2";

const navItems = [
  { key: "dashboard", path: "/", label: "Home", Icon: Home },
  { key: "history", path: "/history", label: "Journal", Icon: BookOpen },
  { key: "analytics", path: "/analytics", label: "Rhythm", Icon: Activity },
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

// Three log actions, bottom-to-top: Reading closest to thumb, then Meal, then Insulin.
function readManualGlucoseEnabled() {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem("manual_glucose_logging_enabled");
  return raw === null ? true : raw === "true";
}

const EASE = [0.22, 1, 0.36, 1];

export default function UnifiedBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

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

  // ── Log pill state ──────────────────────────────────────────
  const [expanded, setExpanded] = useState(false);
  const [selectedMode, setSelectedMode] = useState(null);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const [doseFormPreloaded, setDoseFormPreloaded] = useState(false);
  const [combinedSheetOpen, setCombinedSheetOpen] = useState(false);
  const [manualGlucoseEnabled, setManualGlucoseEnabled] = useState(readManualGlucoseEnabled);
  const { connected: dexcomConnected } = useDexcomConnection();

  // Three actions: bottom (closest to thumb) = Reading, middle = Meal, top = Insulin.
  // Rendered bottom-to-top so the order in the array matches stacking.
  const actions = useMemo(() => {
    const list = [
      { id: "insulin", label: "Log Insulin", Icon: Syringe, mode: "insulin" },
      { id: "carbs", label: "Log Meal", Icon: Wheat, mode: "carbs" },
    ];
    if (manualGlucoseEnabled && !dexcomConnected) {
      list.unshift({ id: "glucose", label: "Log Reading", Icon: Droplets, mode: "glucose" });
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

  // Allow other parts of the app to open the log sheet directly.
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

  // Close on Escape when the stack is open (no sheet mounted yet).
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Lock background scroll while the action stack is open (no sheet mounted).
  useEffect(() => {
    if (!expanded || doseFormOpen || combinedSheetOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded, doseFormOpen, combinedSheetOpen]);

  // The action stack clears when a sheet opens.
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

      {/* Scrim dims the page while the action stack is open */}
      <AnimatePresence>
        {stackVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0"
            style={{ background: "rgba(63,56,48,0.25)", zIndex: 40 }}
            onClick={() => setExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Floating pill nav — 16px side insets, 28px radius, soft shadow ── */}
      <nav
        className="fixed inset-x-0"
        style={{
          bottom: "calc(16px + env(safe-area-inset-bottom))",
          paddingLeft: "16px",
          paddingRight: "16px",
          zIndex: 50,
        }}
      >
        <div
          className="mx-auto flex items-center justify-between"
          style={{
            maxWidth: "30rem",
            background: "rgba(253,249,242,0.62)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(253,249,242,0.55)",
            borderRadius: "28px",
            boxShadow: "0 8px 28px rgba(63,56,48,0.16), 0 2px 8px rgba(63,56,48,0.08)",
            padding: "8px",
            height: "60px",
          }}
        >
          {navItems.map((item) => {
            const isActive = navItems.indexOf(item) === activeIndex;
            const { Icon, label } = item;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={(e) => handleTabPress(e, item)}
                className="relative flex flex-col items-center justify-center gap-1 rounded-[20px] transition-colors"
                style={{
                  flex: "1 1 0",
                  minWidth: "44px",
                  minHeight: "44px",
                  color: isActive ? COPPER : FAINT,
                }}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon
                  className="h-5 w-5"
                  strokeWidth={isActive ? 2.4 : 1.7}
                  style={{ color: isActive ? COPPER : FAINT }}
                />
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide leading-none"
                  style={{ color: isActive ? INK : FAINT }}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Copper "Log" pill — bottom-right, above the nav ── */}
      {/* Actions rise vertically upward: Reading (closest), Meal, Insulin (top). */}
      <div
        className="fixed"
        style={{
          right: "calc(20px + env(safe-area-inset-right))",
          bottom: "calc(76px + env(safe-area-inset-bottom))",
          zIndex: 55,
        }}
      >
        {/* Action stack — bottom-to-top staggered rise */}
        <AnimatePresence>
          {stackVisible && (
            <div className="absolute right-0 bottom-[60px] flex flex-col items-end gap-3">
              {actions.map((action, i) => {
                const ActionIcon = action.Icon;
                // i=0 is the bottommost (first to rise, closest to thumb).
                return (
                  <motion.button
                    key={action.id}
                    type="button"
                    onClick={() => openAction(action.mode)}
                    initial={{ opacity: 0, y: 16, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.92 }}
                    transition={{ duration: 0.24, ease: EASE, delay: i * 0.05 }}
                    whileTap={{ scale: 0.96 }}
                    className="flex items-center gap-2.5 pl-4 pr-5"
                    style={{
                      background: CREAM,
                      color: INK,
                      borderRadius: "9999px",
                      height: "48px",
                      boxShadow: "0 8px 24px rgba(63,56,48,0.18), 0 2px 6px rgba(63,56,48,0.10)",
                    }}
                    aria-label={action.label}
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full"
                      style={{ background: "rgba(156,82,40,0.12)" }}
                    >
                      <ActionIcon className="h-4 w-4" style={{ color: COPPER }} />
                    </span>
                    <span className="text-sm font-semibold leading-none whitespace-nowrap">
                      {action.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          )}
        </AnimatePresence>

        {/* The Log pill itself — copper, morphs to × when open */}
        <motion.button
          type="button"
          onClick={togglePill}
          aria-label={expanded ? "Close log menu" : "Log a moment"}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 pl-5 pr-6"
          style={{
            height: "52px",
            background: "rgba(156,82,40,0.82)",
            backdropFilter: "blur(16px) saturate(160%)",
            WebkitBackdropFilter: "blur(16px) saturate(160%)",
            border: "1px solid rgba(253,249,242,0.22)",
            color: CREAM,
            borderRadius: "9999px",
            boxShadow: "0 8px 24px rgba(156,82,40,0.32), 0 2px 6px rgba(63,56,48,0.16)",
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {expanded ? (
              <motion.span
                key="x"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="flex items-center"
              >
                <X className="h-5 w-5" />
              </motion.span>
            ) : (
              <motion.span
                key="plus"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="flex items-center gap-2"
              >
                <Plus className="h-5 w-5" />
                <span className="text-sm font-bold leading-none tracking-wide">Log</span>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </>
  );
}