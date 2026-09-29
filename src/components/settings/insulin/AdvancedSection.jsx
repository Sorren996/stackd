import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Progressive-disclosure wrapper for rarely-touched settings.
 *
 * Rendered as a plainly visible full-width interactive row (espresso label +
 * rotating chevron) rather than faint caps text, so it reads like every other
 * tappable row in the page and meets WCAG AA (no low-contrast gray label).
 * Tapping it expands the children inline.
 */
export default function AdvancedSection({ children, label = "Advanced" }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl p-5" style={{ background: "#fdf9f2", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-1 text-left transition active:opacity-70"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold" style={{ color: "#3f3830" }}>
          <Settings2 className="h-4 w-4" style={{ color: "#5b6550" }} />
          {label}
        </span>
        <ChevronDown
          className="h-5 w-5 transition-transform duration-200"
          style={{ color: "#3f3830", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
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
            <div className="space-y-4 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}