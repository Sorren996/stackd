import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Syringe, Droplets, Wheat } from "lucide-react";
import DoseForm from "@/components/DoseForm";

const ACTIONS = [
  { id: "insulin", label: "Support", Icon: Syringe, color: "91,163,184" },
  { id: "glucose", label: "Glucose", Icon: Droplets, color: "91,168,138" },
  { id: "carbs", label: "Nourishment", Icon: Wheat, color: "212,160,86" },
];

export default function FloatingActionMenu() {
  const [expanded, setExpanded] = useState(false);
  const [selectedMode, setSelectedMode] = useState(null);
  const [doseFormOpen, setDoseFormOpen] = useState(false);
  const [doseFormPreloaded, setDoseFormPreloaded] = useState(false);

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

  const handleSelect = (mode) => {
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

      {/* Backdrop when bloom menu is open */}
      <AnimatePresence>
        {expanded && !doseFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* Bloom buttons + main FAB */}
      <div className="fixed bottom-24 right-5 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {expanded && !doseFormOpen &&
            ACTIONS.slice()
              .reverse()
              .map((action, index) => {
                const ActionIcon = action.Icon;
                const delay = (ACTIONS.length - 1 - index) * 0.06;
                return (
                  <motion.button
                    key={action.id}
                    type="button"
                    onClick={() => handleSelect(action.id)}
                    initial={{ opacity: 0, scale: 0, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0, y: 30 }}
                    transition={{ type: "spring", stiffness: 380, damping: 22, delay }}
                    whileTap={{ scale: 0.88 }}
                    className="flex h-14 w-14 items-center justify-center rounded-full border backdrop-blur-sm"
                    style={{
                      background:
                        "linear-gradient(145deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))",
                      borderColor: `rgba(${action.color},0.5)`,
                      boxShadow: `0 8px 24px rgba(${action.color},0.25), inset 0 1px 1px rgba(255,255,255,0.2)`,
                    }}
                    aria-label={action.label}
                  >
                    <ActionIcon
                      className="h-6 w-6"
                      style={{ color: `rgba(${action.color},0.95)` }}
                    />
                  </motion.button>
                );
              })}
        </AnimatePresence>

        {/* Main FAB */}
        <motion.button
          type="button"
          onClick={() => setExpanded(!expanded)}
          whileTap={{ scale: 0.9 }}
          animate={{ rotate: expanded ? 135 : 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 20 }}
          className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border backdrop-blur-sm"
          style={{
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.24), rgba(255,255,255,0.08))",
            borderColor: "rgba(255,255,255,0.28)",
            boxShadow:
              "0 18px 48px rgba(0,0,0,0.34), inset 0 1px 1px rgba(255,255,255,0.42), inset 0 -1px 1px rgba(255,255,255,0.1)",
          }}
          aria-label={expanded ? "Close menu" : "Open logging menu"}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-5 opacity-80"
            style={{
              background:
                "radial-gradient(circle at 28% 0%, rgba(255,255,255,0.34), transparent 38%), radial-gradient(circle at 80% 120%, rgba(45,212,191,0.22), transparent 44%)",
            }}
          />
          <Plus className="relative z-10 h-7 w-7 text-white/85 drop-shadow-sm" />
        </motion.button>
      </div>
    </>
  );
}