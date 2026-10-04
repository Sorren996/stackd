import { useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";

/**
 * Full-screen insulin library picker — Apple picker style.
 * Flat list grouped by action speed with sticky category headers and checkmarks.
 */
const CATEGORY_ORDER = ["Rapid", "Short", "Intermediate", "Long", "Premixed"];
const CATEGORY_LABELS = {
  Rapid: "Rapid-acting",
  Short: "Short-acting",
  Intermediate: "Intermediate-acting",
  Long: "Long-acting",
  Premixed: "Premixed",
};

// Map INSULIN_PROFILES category → display group key.
function groupKeyFor(category) {
  if (category === "Rapid-Acting") return "Rapid";
  if (category === "Short-Acting") return "Short";
  if (category === "Intermediate-Acting") return "Intermediate";
  if (category === "Long-Acting" || category === "Ultra-Long-Acting") return "Long";
  if (category === "Premixed") return "Premixed";
  return "Rapid";
}

export default function LibraryPicker({ selected, onToggle, onClose }) {
  const grouped = useMemo(() => {
    const map = {};
    for (const [name, profile] of Object.entries(INSULIN_PROFILES)) {
      const key = groupKeyFor(profile.category);
      if (!map[key]) map[key] = [];
      map[key].push(name);
    }
    return CATEGORY_ORDER.filter((k) => map[k]).map((k) => ({ key: k, items: map[k] }));
  }, []);

  const scrollRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  if (typeof document === "undefined") return null;

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
            My insulin library
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

        {/* Scrollable group list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {grouped.map(({ key, items }) => (
            <div key={key}>
              {/* Sticky category header */}
              <div
                className="sticky top-0 z-10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ background: "#f7f1e8", color: "#746959", borderBottom: "1px solid #eadccf" }}
              >
                {CATEGORY_LABELS[key]}
              </div>
              {items.map((name) => {
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
          ))}
        </div>

        {/* Footer */}
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