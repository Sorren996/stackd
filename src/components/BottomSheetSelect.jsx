import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

/**
 * BottomSheetSelect — a native-style modal bottom-sheet picker.
 *
 * Replaces raw <select> elements, which render a clunky dropdown inside an
 * iOS WebView. Tapping the field opens a sheet anchored to the bottom of the
 * screen (safe-area aware) with the options listed as tappable rows.
 *
 * Keeps the same controlled-field contract as a <select>: `value`,
 * `onChange(nextValue)`, `options` (array of { value, label, description? }),
 * `placeholder`, and an optional leading `label`.
 */
export default function BottomSheetSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
  valueKey = "value",
  labelKey = "label",
  descriptionKey = "description",
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o[valueKey] === value);
  const display = selected ? selected[labelKey] : null;

  // Close the sheet when the device back/scroll happens.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSelect = (option) => {
    onChange(option[valueKey]);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-w-0 flex-1 items-center gap-1.5 text-right text-sm font-semibold focus:outline-none"
        style={{ color: "#3f3830" }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 truncate">
          {display || <span style={{ color: "#746959" }}>{placeholder}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "#746959" }} />
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[100]">
            {/* Scrim */}
            <motion.button
              type="button"
              aria-label="Close"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 w-full"
              style={{ background: "rgba(63,56,48,0.35)" }}
            />

            {/* Sheet */}
            <motion.div
              role="listbox"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 340 }}
              className="absolute inset-x-0 bottom-0"
              style={{
                paddingBottom: "env(safe-area-inset-bottom)",
                background: "#fdf9f2",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                boxShadow: "0 -12px 40px rgba(63,56,48,0.18)",
                overflow: "hidden",
              }}
            >
              <div className="mx-auto mt-2 h-1 w-10 rounded-full" style={{ background: "#d8cec2" }} />

              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                {label ? (
                  <span className="stackd-section-label">{label}</span>
                ) : (
                  <span className="w-1" />
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs font-semibold"
                  style={{ color: "#9c5228" }}
                >
                  Done
                </button>
              </div>

              <div className="max-h-[55vh] overflow-y-auto overscroll-contain pb-4">
                {options.map((option) => {
                  const isSelected = option[valueKey] === value;
                  return (
                    <button
                      key={option[valueKey]}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(option)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors active:bg-black/[0.03]"
                    >
                      <span className="min-w-0">
                        <span
                          className="block truncate text-sm font-medium"
                          style={{ color: isSelected ? "#9c5228" : "#3f3830" }}
                        >
                          {option[labelKey]}
                        </span>
                        {option[descriptionKey] && (
                          <span
                            className="mt-0.5 block truncate text-[11px]"
                            style={{ color: "#746959" }}
                          >
                            {option[descriptionKey]}
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0" style={{ color: "#9c5228" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}