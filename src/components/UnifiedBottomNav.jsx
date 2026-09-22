import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence, animate } from "framer-motion";
import { Home, BookOpen, Activity, CircleUser, Plus, X, Syringe, Droplets, Wheat, Utensils } from "lucide-react";
import DoseForm from "@/components/DoseForm";
import CombinedLogSheet from "@/components/CombinedLogSheet";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/history", label: "Journal", icon: BookOpen },
  { path: "/analytics", label: "Rhythm", icon: Activity },
  { path: "/settings", label: "Profile", icon: CircleUser },
];

const ALL_ACTIONS = [
  { id: "glucose", label: "Glucose", Icon: Droplets },
  { id: "insulin", label: "Support", Icon: Syringe },
  { id: "carbs", label: "Nourishment", Icon: Wheat },
  { id: "both", label: "Meal + Support", Icon: Utensils },
];

const NAV_HEIGHT = 64;
const EASE = [0.22, 1, 0.36, 1];
const ANIM_DURATION = 0.3;

function readManualGlucoseEnabled() {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem("manual_glucose_logging_enabled");
  return raw === null ? true : raw === "true";
}

export default function UnifiedBottomNav() {
  const location = useLocation();

  const activeIndex = (() => {
    if (location.pathname.startsWith("/settings")) return 3;
    const idx = navItems.findIndex((it) => it.path === location.pathname);
    return idx === -1 ? 0 : idx;
  })();

  // ── FAB / menu / logging forms ──
  const [expanded, setExpanded] = useState(false);
  const [menuHeight, setMenuHeight] = useState(0);
  const [selectedMode, setSelectedMode] = useState(null);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const [doseFormPreloaded, setDoseFormPreloaded] = useState(false);
  const [combinedSheetOpen, setCombinedSheetOpen] = useState(false);
  const [manualGlucoseEnabled, setManualGlucoseEnabled] = useState(readManualGlucoseEnabled);
  const { connected: dexcomConnected } = useDexcomConnection();

  const menuContentRef = useRef(null);
  const currentHeight = useRef(0);
  const animControls = useRef(null);

  const actions = useMemo(
    () =>
      manualGlucoseEnabled && !dexcomConnected
        ? ALL_ACTIONS
        : ALL_ACTIONS.filter((a) => a.id !== "glucose"),
    [manualGlucoseEnabled, dexcomConnected]
  );

  // ── Menu height animation ──
  const animateMenu = useCallback((target) => {
    if (animControls.current) animControls.current.stop();
    animControls.current = animate(currentHeight.current, target, {
      duration: ANIM_DURATION,
      ease: EASE,
      onUpdate: (v) => {
        currentHeight.current = v;
        setMenuHeight(v);
      },
    });
  }, []);

  useEffect(() => {
    return () => { if (animControls.current) animControls.current.stop(); };
  }, []);

  useEffect(() => {
    setExpanded(false);
    animateMenu(0);
  }, [location.pathname, animateMenu]);

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

  useEffect(() => {
    const handler = (e) => {
      const mode = e?.detail?.mode;
      if (!mode) return;
      setExpanded(false);
      animateMenu(0);
      if (mode === "both") {
        setCombinedSheetOpen(true);
      } else {
        setSelectedMode(mode);
        setDoseFormPreloaded(true);
        setDoseFormOpen(true);
      }
    };
    window.addEventListener("stackd-open-log", handler);
    return () => window.removeEventListener("stackd-open-log", handler);
  }, [animateMenu]);

  const handleFabClick = () => {
    if (expanded) {
      setExpanded(false);
      animateMenu(0);
    } else {
      setExpanded(true);
      const h = menuContentRef.current?.offsetHeight || 0;
      animateMenu(h);
    }
  };

  const handleSelect = (mode) => {
    setExpanded(false);
    animateMenu(0);
    if (mode === "both") {
      setCombinedSheetOpen(true);
      return;
    }
    setSelectedMode(mode);
    setDoseFormPreloaded(true);
    setDoseFormOpen(true);
  };

  // Lock background scroll while the menu is open
  useEffect(() => {
    if (!expanded || doseFormOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [expanded, doseFormOpen]);

  return (
    <>
      {(doseFormPreloaded || doseFormOpen) && (
        <DoseForm open={doseFormOpen} onOpenChange={setDoseFormOpen} mode={selectedMode} />
      )}

      {combinedSheetOpen && (
        <CombinedLogSheet open={combinedSheetOpen} onOpenChange={setCombinedSheetOpen} />
      )}

      {/* Backdrop */}
      <AnimatePresence>
        {expanded && !doseFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(63,56,48,0.20)" }}
            onClick={() => handleFabClick()}
          />
        )}
      </AnimatePresence>

      <motion.nav
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-x-0 bottom-0 flex justify-center"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", zIndex: expanded ? 50 : 30 }}
      >
        <div className="relative mx-4 mb-4" style={{ width: "min(calc(100vw - 2rem), 26rem)" }}>
          {/* ── Menu content — expands upward from the nav pill ── */}
          <div
            style={{
              position: "absolute",
              bottom: NAV_HEIGHT + 8,
              left: 0,
              right: 0,
              height: menuHeight,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
            }}
          >
            <div ref={menuContentRef}>
              {/* Picker-style floating overlay */}
              <div
                className="overflow-hidden rounded-3xl"
                style={{
                  background: "#fdf9f2",
                  border: "1px solid #eadccf",
                  boxShadow: "0 8px 28px rgba(63,56,48,0.12), 0 2px 8px rgba(63,56,48,0.06)",
                }}
              >
                <div className="px-6 pt-5 pb-2 text-center">
                  <h3 className="text-sm font-semibold" style={{ color: "#3f3830" }}>Log a moment</h3>
                </div>
                <div className="space-y-1 px-3 pb-4">
                  {actions.map((action) => {
                    const ActionIcon = action.Icon;
                    return (
                      <motion.button
                        key={action.id}
                        type="button"
                        onClick={() => handleSelect(action.id)}
                        whileTap={{ scale: 0.97 }}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-black/[0.03]"
                        aria-label={action.label}
                      >
                        <ActionIcon className="h-4 w-4 shrink-0" style={{ color: "#6b6153" }} />
                        <span className="text-sm font-medium" style={{ color: "#3f3830" }}>
                          {action.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Nav pill — simple floating pill, no glass shape ── */}
          <div
            className="grid grid-cols-4 gap-1 px-2 py-2.5"
            style={{
              height: NAV_HEIGHT,
              background: "#fdf9f2",
              border: "1px solid #eadccf",
              borderRadius: "28px",
              boxShadow: "0 4px 20px rgba(63,56,48,0.10)",
              position: "relative",
              zIndex: 50,
            }}
          >
            {navItems.map((item, index) => {
              const isActive = index === activeIndex;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="relative flex min-w-0 flex-col items-center justify-center gap-1 text-center transition-colors"
                  style={{ color: isActive ? "#3f3830" : "#a89e8d" }}
                  aria-label={item.label}
                >
                  <Icon
                    className="h-5 w-5"
                    strokeWidth={isActive ? 2 : 1.5}
                    style={{ color: isActive ? "#3f3830" : "#a89e8d" }}
                  />
                  <span
                    className="text-[9.5px] font-semibold uppercase tracking-wide"
                    style={{ color: isActive ? "#3f3830" : "#a89e8d" }}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* ── FAB — floating above the nav pill ── */}
          <button
            type="button"
            onClick={handleFabClick}
            aria-label={expanded ? "Close menu" : "Open logging menu"}
            className="absolute left-1/2 z-[60] flex -translate-x-1/2 items-center justify-center rounded-full"
            style={{
              bottom: NAV_HEIGHT - 20,
              width: 48,
              height: 48,
              background: "#3f3830",
              border: "1px solid #3f3830",
              boxShadow: "0 6px 20px rgba(63,56,48,0.20)",
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
                  className="flex"
                >
                  <X className="h-5 w-5" style={{ color: "#f7f1e8" }} />
                </motion.span>
              ) : (
                <motion.span
                  key="plus"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  className="flex"
                >
                  <Plus className="h-5 w-5" style={{ color: "#f7f1e8" }} />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.nav>
    </>
  );
}