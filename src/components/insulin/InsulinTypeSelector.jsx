import { useEffect, useRef } from "react";

/**
 * Inline horizontal insulin type selector.
 * Renders the user's configured insulin library as compact, tappable
 * capsules in a single non-wrapping, horizontally scrollable row.
 * One tap selects — no dropdown or modal.
 */
export default function InsulinTypeSelector({ value, onChange, options }) {
  const scrollRef = useRef(null);
  const selectedRef = useRef(null);

  // Keep the selected capsule visible when it changes (e.g. when a new row
  // inherits the previous selection) without forcing a scroll on every render.
  useEffect(() => {
    if (!selectedRef.current || !scrollRef.current) return;
    const el = selectedRef.current;
    const container = scrollRef.current;
    const elLeft = el.offsetLeft;
    const elRight = elLeft + el.offsetWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    if (elLeft < viewLeft) {
      container.scrollTo({ left: elLeft - 8, behavior: "smooth" });
    } else if (elRight > viewRight) {
      container.scrollTo({ left: elRight - container.clientWidth + 8, behavior: "smooth" });
    }
  }, [value]);

  if (!options.length) {
    return (
      <div>
        <span className="stackd-section-label">Insulin Type</span>
        <p className="mt-2 text-xs text-white/40">Add insulin types in Settings to log a dose.</p>
      </div>
    );
  }

  return (
    <div>
      <span className="stackd-section-label">Insulin Type</span>
      <div
        ref={scrollRef}
        className="no-scrollbar mt-2 flex gap-2 overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              ref={isSelected ? selectedRef : null}
              type="button"
              onClick={() => onChange(option.value)}
              className="flex shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors"
              style={{
                height: 44,
                borderColor: isSelected ? "rgba(91,168,138,0.55)" : "rgba(255,255,255,0.10)",
                background: isSelected
                  ? "linear-gradient(145deg, rgba(91,168,138,0.22), rgba(91,163,184,0.14))"
                  : "rgba(255,255,255,0.03)",
                boxShadow: isSelected
                  ? "0 0 0 1px rgba(91,168,138,0.25), 0 6px 18px rgba(91,168,138,0.18), inset 0 1px 1px rgba(255,255,255,0.10)"
                  : "inset 0 1px 1px rgba(255,255,255,0.04)",
                color: isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.62)",
              }}
              aria-pressed={isSelected}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}