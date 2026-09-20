import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Wind, Leaf, Waves, CircleUser, Plus, Syringe, Droplets, Wheat, Utensils } from "lucide-react";
import DoseForm from "@/components/DoseForm";
import CombinedLogSheet from "@/components/CombinedLogSheet";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";

const navItems = [
  { path: "/", label: "My Flow", icon: Wind },
  { path: "/history", label: "My Journal", icon: Leaf },
  { path: "/analytics", label: "My Rhythms", icon: Waves },
  { path: "/settings", label: "Profile", icon: CircleUser },
];

const ALL_ACTIONS = [
  { id: "glucose", label: "Glucose", Icon: Droplets, color: "91,168,138" },
  { id: "insulin", label: "Support", Icon: Syringe, color: "91,163,184" },
  { id: "carbs", label: "Nourishment", Icon: Wheat, color: "212,160,86" },
  { id: "both", label: "Meal + Support", Icon: Utensils, color: "45,212,191" },
];

const EASE = [0.22, 1, 0.36, 1];

// FAB diameter (h-14 w-14). The notch cut into the nav glass is slightly
// smaller so the FAB always covers it — no gap, no seam.
const FAB_SIZE = 56;
const NOTCH_RADIUS = 26;

// Shared glass material — the nav and FAB use the exact same surface so the
// FAB reads as a raised portion of the navigation, not a separate button.
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
  const navigate = useNavigate();

  // ── Active-tab indicator (scroll-independent, measured in nav space) ──
  const activeIndex = (() => {
    if (location.pathname.startsWith("/settings")) return 3;
    const idx = navItems.findIndex((it) => it.path === location.pathname);
    return idx === -1 ? 0 : idx;
  })();

  const tabRefs = useRef([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, top: 0, height: 0, ready: false });

  const measureIndicator = useCallback(() => {
    const el = tabRefs.current[activeIndex];
    if (!el) return;
    const first = tabRefs.current[0] || el;
    setIndicator({
      left: el.offsetLeft,
      width: el.offsetWidth,
      top: first.offsetTop,
      height: first.offsetHeight,
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

  const handleLogoClick = () => navigate("/");

  // ── FAB / action menu / logging forms ──
  const [expanded, setExpanded] = useState(false);
  const [selectedMode, setSelectedMode] = useState(null);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const [doseFormPreloaded, setDoseFormPreloaded] = useState(false);
  const [combinedSheetOpen, setCombinedSheetOpen] = useState(false);
  const [manualGlucoseEnabled, setManualGlucoseEnabled] = useState(readManualGlucoseEnabled);
  const { connected: dexcomConnected } = useDexcomConnection();

  // A connected CGM streams glucose automatically — step aside so manual
  // logging doesn't duplicate what the sensor already provides.
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

  // Lock background scroll while the action menu is open so the dimmed,
  // blurred page stays put behind the emerging options.
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

      {/* Blurred backdrop — dims and freezes the page while the menu is open. */}
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
          The FAB shares the nav's exact glass material and rises from a
          semicircular notch masked out of the nav — no gap, no separate
          border, no detached shadow. */}
      <motion.nav
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-x-0 bottom-0 flex justify-center"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", zIndex: expanded ? 50 : 30 }}
      >
        <div className="relative mx-4 mb-4">
          {/* Action menu — emerges from the FAB's exact position. The first
              option overlays the FAB spot and the rest rise above it. */}
          <AnimatePresence>
            {expanded && !doseFormOpen && (
              <motion.div
                initial="hidden"
                animate="show"
                exit="hidden"
                variants={{ show: { transition: { staggerChildren: 0.05 } } }}
                className="absolute left-1/2 z-[55] flex flex-col-reverse items-center gap-4"
                style={{ bottom: "100%", transform: "translateX(-50%) translateY(-25%)" }}
              >
                {actions.map((action) => {
                  const ActionIcon = action.Icon;
                  return (
                    <motion.button
                      key={action.id}
                      type="button"
                      onClick={() => handleSelect(action.id)}
                      variants={{
                        hidden: { opacity: 0, y: 24 },
                        show: { opacity: 1, y: 0 },
                      }}
                      transition={{ duration: 0.22, ease: EASE }}
                      whileTap={{ scale: 0.94 }}
                      className="flex items-center gap-3"
                      aria-label={action.label}
                    >
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-sm"
                        style={{
                          background: `linear-gradient(145deg, rgba(${action.color},0.16), rgba(${action.color},0.06))`,
                          borderColor: `rgba(${action.color},0.32)`,
                          boxShadow: `0 6px 18px rgba(${action.color},0.18), inset 0 1px 1px rgba(255,255,255,0.12)`,
                        }}
                      >
                        <ActionIcon className="h-5 w-5" style={{ color: `rgba(${action.color},0.95)` }} />
                      </span>
                      <span
                        className="rounded-full border px-3 py-1.5 text-sm font-semibold backdrop-blur-sm"
                        style={{
                          color: "rgba(255,255,255,0.92)",
                          background: "linear-gradient(145deg, rgba(15,24,22,0.72), rgba(15,24,22,0.52))",
                          borderColor: `rgba(${action.color},0.28)`,
                        }}
                      >
                        {action.label}
                      </span>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* FAB — transparent, no background or border. Just the + glyph
              floating over the notch. The action menu emerges from here. */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Close menu" : "Open logging menu"}
            className="absolute left-1/2 z-20 flex -translate-x-1/2 items-center justify-center rounded-full"
            style={{
              top: `-${FAB_SIZE / 2}px`,
              width: `${FAB_SIZE}px`,
              height: `${FAB_SIZE}px`,
              background: "transparent",
              border: "none",
            }}
          >
            <motion.span
              animate={{ rotate: expanded ? 45 : 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="relative z-10 flex"
            >
              <Plus className="h-6 w-6 text-white/90 drop-shadow-sm" />
            </motion.span>
          </button>

          {/* Nav bar — a single continuous glass surface. The drop shadow
              lives on the container (never clipped); the glass fill + border
              live on a masked layer so the notch removes only the material,
              never the nav items or the active-tab indicator. */}
          <div
            className="stackd-bottom-nav relative grid w-[min(calc(100vw-2rem),26rem)] grid-cols-4 gap-1 overflow-hidden rounded-[2rem] px-2 py-1.5"
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

            {indicator.ready && (
              <motion.div
                aria-hidden="true"
                initial={false}
                animate={{ left: indicator.left, width: indicator.width }}
                transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.8 }}
                className="pointer-events-none absolute rounded-[1.55rem]"
                style={{
                  top: indicator.top,
                  height: indicator.height,
                  background: "linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))",
                  border: "1px solid rgba(255,255,255,0.18)",
                  boxShadow:
                    "0 8px 20px rgba(0,0,0,0.18), inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -1px 1px rgba(255,255,255,0.06)",
                }}
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
                >
                  <motion.span
                    className="relative z-10 flex items-center justify-center"
                    animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.07 : 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  >
                    <Icon className="h-5 w-5" />
                  </motion.span>
                  <motion.span
                    className="relative z-10 whitespace-nowrap text-[10px] font-semibold leading-none"
                    animate={{ opacity: isActive ? 1 : 0.64, y: isActive ? 0 : 1 }}
                    transition={{ duration: 0.16 }}
                  >
                    {item.label}
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