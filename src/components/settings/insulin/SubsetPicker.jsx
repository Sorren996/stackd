import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";

/**
 * Subset picker for "Meal & correction types" — lists the user's library and
 * lets them mark which types count toward meal coverage / corrections.
 * Apple picker style, checkmarks, copper highlight on selected.
 */
export default function SubsetPicker({ library, selected, onToggle, onClose }) {
  if (typeof document === "undefined") return null;
  const selectedSet = new Set(selected);

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[80] flex flex-col"
        style={{ background: "#fdf9f2" }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3"
          style={{ borderBottom: "1px solid #eadccf" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#746959" }}>
            Meal &amp; correction types
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: "#f7f1e8", border: "1px solid #eadccf", color: "#3f3830" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="px-4 pt-3 pb-1 text-sm leading-relaxed" style={{ color: "#6b6153" }}>
          Choose the types you use for meals or corrections.
        </p>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2" style={{ scrollbarWidth: "thin", overscrollBehavior: "contain", touchAction: "pan-y" }}>
          {library.map((name) => {
            const isSelected = selectedSet.has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => onToggle(name)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors active:bg-black/[0.03]"
                style={{ minHeight: 52, borderBottom: "1px solid #f0e8db" }}
              >
                <span className="text-base" style={{ color: isSelected ? "#3f3830" : "#6b6153" }}>
                  {name}
                </span>
                {isSelected && <Check className="h-5 w-5 shrink-0" style={{ color: "#9c5228" }} />}
              </button>
            );
          })}
        </div>

        <div
          className="shrink-0 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
          style={{ borderTop: "1px solid #eadccf" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full py-3.5 text-sm font-semibold transition active:scale-[0.98]"
            style={{ background: "#9c5228", color: "#fdf9f2", boxShadow: "0 4px 16px rgba(156,82,40,0.28)" }}
          >
            Save selections
          </button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}