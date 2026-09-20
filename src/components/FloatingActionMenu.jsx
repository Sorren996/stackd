import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Syringe, Droplets, Wheat, Utensils } from "lucide-react";
import DoseForm from "@/components/DoseForm";
import CombinedLogSheet from "@/components/CombinedLogSheet";

const ALL_ACTIONS = [
  { id: "both", label: "Meal + Support", Icon: Utensils, color: "45,212,191" },
  { id: "carbs", label: "Nourishment", Icon: Wheat, color: "212,160,86" },
  { id: "insulin", label: "Support", Icon: Syringe, color: "91,163,184" },
  { id: "glucose", label: "Glucose", Icon: Droplets, color: "91,168,138" },
];

const EASE = [0.22, 1, 0.36, 1];

function readManualGlucoseEnabled() {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem("manual_glucose_logging_enabled");
  return raw === null ? true : raw === "true";
}

export default function FloatingActionMenu() {
  const [expanded, setExpanded] = useState(false);
  const [selectedMode, setSelectedMode] = useState(null);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const [doseFormPreloaded, setDoseFormPreloaded] = useState(false);
  const [combinedSheetOpen, setCombinedSheetOpen] = useState(false);
  const [manualGlucoseEnabled, setManualGlucoseEnabled] = useState(readManualGlucoseEnabled);

  // Glucose appears only when the user has manual glucose logging enabled.
  const actions = useMemo(
    () => (manualGlucoseEnabled ? ALL_ACTIONS : ALL_ACTIONS.filter((a) => a.id !== "glucose")),
    [manualGlucoseEnabled]
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

  // Allow other parts of the app (e.g. the Meal Balance modal) to open a
  // logging form directly via a window event.
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

  return (
    <>
      {(doseFormPreloaded || doseFormOpen) && (
        <DoseForm open={doseFormOpen} onOpenChange={setDoseFormOpen} mode={selectedMode} />
      )}

      {combinedSheetOpen && (
        <CombinedLogSheet open={combinedSheetOpen} onOpenChange={setCombinedSheetOpen} />
      )}

      {/* Outside-tap catcher — transparent, not a modal. Keeps the page
          feeling open while still dismissing the action menu on tap. */}
      <AnimatePresence>
        {expanded && !doseFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.15)" }}
            onClick={() => setExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* FAB + action menu — centered over the bottom navigation, overlapping
          its top edge. The FAB stays anchored; actions emerge upward. */}
      <div
        className="fixed left-1/2 z-50 flex -translate-x-1/2 flex-col items-center"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 3.125rem)" }}
      >
        <AnimatePresence>
          {expanded && !doseFormOpen && (
            <motion.div
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={{ show: { transition: { staggerChildren: 0.05 } } }}
              className="flex flex-col items-center gap-4 pb-4"
            >
              {actions.map((action) => {
                const ActionIcon = action.Icon;
                return (
                  <motion.button
                    key={action.id}
                    type="button"
                    onClick={() => handleSelect(action.id)}
                    variants={{
                      hidden: { opacity: 0, y: 14 },
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

        {/* Main FAB — anchored, + morphs to × via a smooth rotation */}
        <motion.button
          type="button"
          onClick={() => setExpanded(!expanded)}
          whileTap={{ scale: 0.92 }}
          className="stackd-fab relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border backdrop-blur-sm"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))",
            borderColor: "rgba(255,255,255,0.26)",
            boxShadow:
              "0 16px 44px rgba(0,0,0,0.34), inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -1px 1px rgba(255,255,255,0.1)",
          }}
          aria-label={expanded ? "Close menu" : "Open logging menu"}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-5 opacity-80"
            style={{
              background:
                "radial-gradient(circle at 28% 0%, rgba(255,255,255,0.32), transparent 38%), radial-gradient(circle at 80% 120%, rgba(45,212,191,0.22), transparent 44%)",
            }}
          />
          <motion.span
            animate={{ rotate: expanded ? 45 : 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="relative z-10 flex"
          >
            <Plus className="h-6 w-6 text-white/90 drop-shadow-sm" />
          </motion.span>
        </motion.button>
      </div>
    </>
  );
}