import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, CalendarDays, Gauge, CircleUser, Plus, X, Syringe, Droplets, Wheat, Utensils } from "lucide-react";
import DoseForm from "@/components/DoseForm";
import CombinedLogSheet from "@/components/CombinedLogSheet";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/history", label: "Daily Log", icon: CalendarDays },
  { path: "/analytics", label: "Time in Range", icon: Gauge },
  { path: "/settings", label: "Profile", icon: CircleUser },
];

const ALL_ACTIONS = [
  { id: "glucose", label: "Glucose", Icon: Droplets, color: "91,168,138" },
  { id: "insulin", label: "Support", Icon: Syringe, color: "91,163,184" },
  { id: "carbs", label: "Nourishment", Icon: Wheat, color: "212,160,86" },
  { id: "both", label: "Meal + Support", Icon: Utensils, color: "45,212,191" },
];

const EASE = [0.22, 1, 0.36, 1];

const FAB_SIZE = 56;
const NOTCH_RADIUS = 26;

const GLASS_BG = "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))";
const GLASS_INSET = "inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -1px 1px rgba(255,255,255,0.04)";
const GLASS_GLOW =
  "radial-gradient(circle at 25% 0%, rgba(255,255,255,0.26), transparent 34%), radial-gradient(circle at 85% 130%, rgba(45,212,191,0.16), transparent 42%)";

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

  const tabRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  const measureIndicator = useCallback(() => {
    const el = tabRefs.current[activeIndex];
    if (!el) return;
    setIndicator({
      left: el.offsetLeft,
      width: el.offsetWidth,
      ready: true,
    });
  }, [activeIndex]);

  useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator]);

  useEffect(() => {
    const onResize = () => measureIndicator();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureIndicator]);

  // ── FAB / action modal / logging forms ──
  const [expanded, setExpanded] = useState(false);
  const [selectedMode, setSelectedMode] = useState(null);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const [doseFormPreloaded, setDoseFormPreloaded] = useState(false);
  const [combinedSheetOpen, setCombinedSheetOpen] = useState(false);
  const [manualGlucoseEnabled, setManualGlucoseEnabled] = useState(readManualGlucoseEnabled);
  const { connected: dexcomConnected } = useDexcomConnection();

  const actions = useMemo(
    () =>
      manualGlucoseEnabled && !dexcomConnected
        ? ALL_ACTIONS
        : ALL_ACTIONS.filter((a) => a.id !== "glucose"),
    [manualGlucoseEnabled, dexcomConnected]
  );

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
  }, []);

  const handleSelect = (mode) => {
    if (mode === "both") {
      setExpanded(false);
      setCombinedSheetOpen(true);
      return;
    }
    setSelectedMode(mode);
    setExpanded(false);
    setDoseFormPreloaded(true);
    setDoseFormOpen(true);
  };

  const notchMask = `radial-gradient(circle ${NOTCH_RADIUS}px at 50% 0%, transparent 92%, #000 100%)`;

  // Lock background scroll while the action modal is open.
  useEffect(() => {
    if (!expanded || doseFormOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded, doseFormOpen]);

  return (
    <>
      {(doseFormPreloaded || doseFormOpen) && (
        <DoseForm open={doseFormOpen} onOpenChange={setDoseFormOpen} mode={selectedMode} />
      )}

      {combinedSheetOpen && (
        <CombinedLogSheet open={combinedSheetOpen} onOpenChange={setCombinedSheetOpen} />
      )}

      {/* Blurred backdrop — dims and freezes the page while the modal is open. */}
      <AnimatePresence>
        {expanded && !doseFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40"
            style={{
              background: "rgba(5,10,12,0.35)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
            onClick={() => setExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* Unified surface: nav bar + FAB as one continuous glass component.
          When the FAB is tapped, a modal panel slides up from the nav as a
          direct extension — the FAB transforms from + to × and stays at the
          junction, seamlessly connecting the nav and the modal. */}
      <motion.nav
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-x-0 bottom-0 flex justify-center"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", zIndex: expanded ? 50 : 30 }}
      >
        <div className="relative mx-4 mb-4">
          {/* ── Action modal — slides up from the nav bar ──
              Positioned directly above the nav, flush at the bottom so it
              reads as an extension of the navigation surface. The FAB/×
              overlaps the bottom center at z-60. */}
          <AnimatePresence>
            {expanded && !doseFormOpen && (
              <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="stackd-glass absolute bottom-full left-1/2 z-[55] w-[min(calc(100vw-2rem),26rem)] overflow-hidden rounded-t-[2rem] border border-b-0"
                style={{ transform: "translateX(-50%)" }}
              >
                {/* Header */}
                <div className="px-6 pt-7 pb-2 text-center">
                  <h3 className="text-base font-semibold text-white/90">Log a moment</h3>
                </div>

                {/* Options list — vertical, each with a colored circular icon */}
                <div className="space-y-1 px-4 pb-14">
                  {actions.map((action) => {
                    const ActionIcon = action.Icon;
                    return (
                      <motion.button
                        key={action.id}
                        type="button"
                        onClick={() => handleSelect(action.id)}
                        whileTap={{ scale: 0.97 }}
                        className="flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white/5"
                        aria-label={action.label}
                      >
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
                          style={{
                            background: `linear-gradient(145deg, rgba(${action.color},0.20), rgba(${action.color},0.08))`,
                            borderColor: `rgba(${action.color},0.35)`,
                            boxShadow: `0 4px 14px rgba(${action.color},0.15), inset 0 1px 1px rgba(255,255,255,0.12)`,
                          }}
                        >
                          <ActionIcon className="h-5 w-5" style={{ color: `rgba(${action.color},0.95)` }} />
                        </span>
                        <span className="text-[15px] font-semibold text-white/85">
                          {action.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── FAB — solid teal surface, sits in the nav notch ──
              Stays in place when the modal opens; transforms from + to ×.
              At z-60 so it sits above both the nav and the modal, creating
              the seamless junction between the two surfaces. */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Close menu" : "Open logging menu"}
            className="absolute left-1/2 z-[60] flex -translate-x-1/2 items-center justify-center rounded-full"
            style={{
              top: `-${FAB_SIZE / 2}px`,
              width: `${FAB_SIZE}px`,
              height: `${FAB_SIZE}px`,
              background: "linear-gradient(145deg, rgba(54,168,138,0.92), rgba(46,140,116,0.92))",
              border: "1px solid rgba(120,210,180,0.30)",
              boxShadow: "0 8px 24px rgba(54,168,138,0.30), inset 0 1px 1px rgba(255,255,255,0.25)",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {expanded ? (
                <motion.span
                  key="x"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="flex"
                >
                  <X className="h-6 w-6 text-white" />
                </motion.span>
              ) : (
                <motion.span
                  key="plus"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="flex"
                >
                  <Plus className="h-6 w-6 text-white" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* ── Nav bar — single continuous glass surface with FAB notch ── */}
          <div
            className="stackd-bottom-nav relative grid w-[min(calc(100vw-2rem),26rem)] grid-cols-4 gap-1 overflow-hidden rounded-[2rem] px-2 py-2.5"
            style={{ boxShadow: "0 14px 40px rgba(0,0,0,0.30)" }}
          >
            {/* Glass layer — masked with the FAB notch */}
            <div
              className="stackd-unified-glass absolute inset-0 rounded-[2rem] border backdrop-blur-sm"
              style={{
                background: GLASS_BG,
                borderColor: "rgba(255,255,255,0.12)",
                boxShadow: GLASS_INSET,
                WebkitMaskImage: notchMask,
                maskImage: notchMask,
              }}
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-8 opacity-70"
              style={{ background: GLASS_GLOW }}
            />

            {/* Active tab — thin underline indicator */}
            {indicator.ready && (
              <motion.div
                aria-hidden="true"
                initial={false}
                animate={{ left: indicator.left + (indicator.width - 24) / 2, opacity: 1 }}
                transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.8 }}
                className="pointer-events-none absolute bottom-0.5 h-[3px] w-6 rounded-full"
                style={{ background: "rgba(255,255,255,0.55)" }}
              />
            )}

            {navItems.map((item, index) => {
              const isActive = index === activeIndex;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  ref={(el) => (tabRefs.current[index] = el)}
                  to={item.path}
                  className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-[1.55rem] px-1.5 py-2 text-center transition-colors ${
                    isActive ? "text-white" : "text-white/45 hover:text-white/75"
                  }`}
                  aria-label={item.label}
                >
                  <motion.span
                    className="relative z-10 flex items-center justify-center"
                    animate={{ scale: isActive ? 1.08 : 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  >
                    <Icon className="h-5 w-5" />
                  </motion.span>
                </Link>
              );
            })}
          </div>
        </div>
      </motion.nav>
    </>
  );
}