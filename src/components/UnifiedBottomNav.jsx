import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, CalendarDays, Gauge, CircleUser, Plus, X, Syringe, Droplets, Wheat, Utensils } from "lucide-react";
import DoseForm from "@/components/DoseForm";
import CombinedLogSheet from "@/components/CombinedLogSheet";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { NavGlassShape, ModalGlassShape, useMeasuredWidth, FAB_SIZE, FAB_RADIUS } from "@/components/nav/GlassShape";

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
const NAV_HEIGHT = 60;

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

  const [navRef, navWidth] = useMeasuredWidth();

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
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            style={{
              background: "rgba(5,10,12,0.45)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
            onClick={() => setExpanded(false)}
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
        <div ref={navRef} className="relative mx-4 mb-4" style={{ width: "min(calc(100vw - 2rem), 26rem)" }}>
          {/* ── Action modal — slides up from behind the nav ──
              The modal has its own glass surface with a bottom notch that
              wraps the FAB from above. It springs up from behind the nav,
              and the FAB stays at the junction, enclosed by both surfaces. */}
          <AnimatePresence>
            {expanded && !doseFormOpen && (
              <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
                className="absolute bottom-full left-0 right-0 z-[45]"
              >
                <ModalGlassShape width={navWidth}>
                  {/* Header */}
                  <div className="px-6 pt-7 pb-2 text-center">
                    <h3 className="text-base font-semibold text-white/90">Log a moment</h3>
                  </div>

                  {/* Options list */}
                  <div className="space-y-1 px-4 pb-10">
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
                </ModalGlassShape>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── FAB — stays at the nav's top edge, centered ──
              The nav's dip wraps its lower half; when the modal opens,
              the modal's notch wraps its upper half. The FAB doesn't
              migrate — the surfaces wrap around it. */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Close menu" : "Open logging menu"}
            className="absolute left-1/2 z-[60] flex -translate-x-1/2 items-center justify-center rounded-full"
            style={{
              top: `-${FAB_RADIUS}px`,
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
                  transition={{ duration: 0.2, ease: EASE }}
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
                  transition={{ duration: 0.2, ease: EASE }}
                  className="flex"
                >
                  <Plus className="h-6 w-6 text-white" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* ── Nav bar — glass surface with FAB dip ──
              The dip is built into the clip-path shape, so the glass
              fill and border both wrap around the FAB seamlessly. */}
          <NavGlassShape width={navWidth} height={NAV_HEIGHT}>
            <div className="relative grid h-full grid-cols-4 gap-1 px-2 py-2.5">
              {/* Active tab — thin underline indicator */}
              {indicator.ready && (
                <motion.div
                  aria-hidden="true"
                  initial={false}
                  animate={{ left: indicator.left + (indicator.width - 24) / 2, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.8 }}
                  className="pointer-events-none absolute bottom-1 h-[3px] w-6 rounded-full"
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
          </NavGlassShape>
        </div>
      </motion.nav>
    </>
  );
}