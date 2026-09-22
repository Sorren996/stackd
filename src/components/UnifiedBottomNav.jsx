import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence, animate } from "framer-motion";
import { Home, BookOpen, Activity, CircleUser, Plus, X, Syringe, Droplets, Wheat, Utensils } from "lucide-react";
import DoseForm from "@/components/DoseForm";
import CombinedLogSheet from "@/components/CombinedLogSheet";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { UnifiedGlassShape, useMeasuredWidth, FAB_SIZE, FAB_RADIUS, NAV_HEIGHT } from "@/components/nav/GlassShape";

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/history", label: "Journal", icon: BookOpen },
  { path: "/analytics", label: "Rhythm", icon: Activity },
  { path: "/settings", label: "Profile", icon: CircleUser },
];

const ALL_ACTIONS = [
  { id: "glucose", label: "Glucose", Icon: Droplets, color: "91,101,80" },
  { id: "insulin", label: "Support", Icon: Syringe, color: "91,163,184" },
  { id: "carbs", label: "Nourishment", Icon: Wheat, color: "175,117,27" },
  { id: "both", label: "Meal + Support", Icon: Utensils, color: "91,101,80" },
];

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

  const tabRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  const measureIndicator = useCallback(() => {
    const el = tabRefs.current[activeIndex];
    if (!el) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
  }, [activeIndex]);

  useLayoutEffect(() => { measureIndicator(); }, [measureIndicator]);

  useEffect(() => {
    const onResize = () => measureIndicator();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureIndicator]);

  // ── FAB / menu / logging forms ──
  const [expanded, setExpanded] = useState(false);
  const [menuHeight, setMenuHeight] = useState(0);
  const [selectedMode, setSelectedMode] = useState(null);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const [doseFormPreloaded, setDoseFormPreloaded] = useState(false);
  const [combinedSheetOpen, setCombinedSheetOpen] = useState(false);
  const [manualGlucoseEnabled, setManualGlucoseEnabled] = useState(readManualGlucoseEnabled);
  const { connected: dexcomConnected } = useDexcomConnection();

  const [navRef, navWidth] = useMeasuredWidth();
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

  // Cleanup animation on unmount
  useEffect(() => {
    return () => { if (animControls.current) animControls.current.stop(); };
  }, []);

  // Close menu on navigation
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

  const totalHeight = NAV_HEIGHT + menuHeight;

  return (
    <>
      {(doseFormPreloaded || doseFormOpen) && (
        <DoseForm open={doseFormOpen} onOpenChange={setDoseFormOpen} mode={selectedMode} />
      )}

      {combinedSheetOpen && (
        <CombinedLogSheet open={combinedSheetOpen} onOpenChange={setCombinedSheetOpen} />
      )}

      {/* Backdrop — dims and freezes the page while the menu is open */}
      <AnimatePresence>
        {expanded && !doseFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            style={{
              background: "rgba(63,56,48,0.20)",
            }}
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
        <div ref={navRef} className="relative mx-4 mb-4" style={{ width: "min(calc(100vw - 2rem), 26rem)", zIndex: 50, pointerEvents: "none" }}>
          {/* ── Unified glass surface — one continuous shape with FAB cutout ──
              The cutout is at the junction between the menu (top) and nav (bottom).
              When closed (menuHeight=0), the cutout is at the top edge → dip.
              When open (menuHeight>0), the cutout is in the center → full hole. */}
          <UnifiedGlassShape width={navWidth} totalHeight={totalHeight} cutoutCy={menuHeight}>

            {/* ── Menu content — sits above the nav, grows upward ──
                    Always rendered (for measurement), clipped by overflow. */}
            <div
              style={{
                position: "absolute",
                bottom: NAV_HEIGHT,
                left: 0,
                right: 0,
                height: menuHeight,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                pointerEvents: "auto",
              }}
            >
              <div ref={menuContentRef}>
                {/* Header */}
                <div className="px-6 pt-7 pb-2 text-center">
                  <h3 className="text-base font-semibold" style={{ color: "#3f3830" }}>Log a moment</h3>
                </div>

                {/* Options */}
                <div className="space-y-1 px-4 pb-10">
                  {actions.map((action) => {
                    const ActionIcon = action.Icon;
                    return (
                      <motion.button
                        key={action.id}
                        type="button"
                        onClick={() => handleSelect(action.id)}
                        whileTap={{ scale: 0.97 }}
                        className="flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-black/[0.03]"
                        aria-label={action.label}
                      >
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border"
                          style={{
                            background: "#fdf9f2",
                            borderColor: "#eadccf",
                          }}
                        >
                          <ActionIcon className="h-5 w-5" style={{ color: "#8a7f70" }} />
                        </span>
                        <span className="text-[15px] font-semibold" style={{ color: "#3f3830" }}>
                          {action.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Nav content — at the bottom, never moves ── */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: NAV_HEIGHT,
                pointerEvents: "auto",
              }}
            >
              <div className="relative grid h-full grid-cols-4 gap-1 px-2 py-2.5">
                {/* Active tab — thin underline indicator */}
                {indicator.ready && (
                  <motion.div
                    aria-hidden="true"
                    initial={false}
                    animate={{ left: indicator.left + (indicator.width - 24) / 2, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.8 }}
                    className="pointer-events-none absolute bottom-1 h-[3px] w-6 rounded-full"
                    style={{ background: "#3f3830" }}
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
                        isActive ? "" : "hover:opacity-70"
                      }`}
                      style={{ color: isActive ? "#3f3830" : "#a89e8d" }}
                      aria-label={item.label}
                    >
                      <motion.span
                        className="relative z-10 flex items-center justify-center"
                        animate={{ scale: isActive ? 1.08 : 1 }}
                        transition={{ type: "spring", stiffness: 420, damping: 28 }}
                      >
                        <Icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.5} />
                      </motion.span>
                      <span className="relative z-10 text-[9px] font-semibold tracking-wide" style={{ color: isActive ? "#3f3830" : "#a89e8d" }}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </UnifiedGlassShape>

          {/* ── FAB — stays at the nav's top edge, never moves ──
              Positioned relative to the container's bottom, so it stays put
              while the shape grows upward. z-60 keeps it in front of the
              expanded menu and glass surface. */}
          <button
            type="button"
            onClick={handleFabClick}
            aria-label={expanded ? "Close menu" : "Open logging menu"}
            className="absolute left-1/2 z-[60] flex -translate-x-1/2 items-center justify-center rounded-full"
            style={{
              bottom: NAV_HEIGHT - FAB_RADIUS,
              width: FAB_SIZE,
              height: FAB_SIZE,
              background: "#3f3830",
              border: "1px solid #3f3830",
              boxShadow: "0 6px 20px rgba(63,56,48,0.20)",
              pointerEvents: "auto",
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
                  <X className="h-6 w-6" style={{ color: "#f7f1e8" }} />
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
                  <Plus className="h-6 w-6" style={{ color: "#f7f1e8" }} />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.nav>
    </>
  );
}