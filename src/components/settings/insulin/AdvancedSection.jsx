import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Collapsible wrapper for rarely-touched settings. Starts collapsed;
 * tapping the header reveals the children with a smooth height animation.
 */
export default function AdvancedSection({ children, label = "Advanced" }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-1 py-1 transition hover:opacity-70"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#746959" }}>{label}</span>
        <ChevronDown
          className="h-4 w-4 transition-transform duration-200"
          style={{ color: "#746959", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}