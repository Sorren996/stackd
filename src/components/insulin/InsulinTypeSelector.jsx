import { useEffect, useRef } from "react";

/**
 * Inline horizontal insulin type selector rendered as a compact
 * "choice wheel" of consistent circles. The row scrolls horizontally
 * in isolation; the parent sheet never moves horizontally. Selection
 * transitions gently illuminate the chosen circle over ~250ms.
 */
const TRANSITION = "border-color 250ms ease-out, background 250ms ease-out, box-shadow 250ms ease-out, color 250ms ease-out";

export default function InsulinTypeSelector({ value, onChange, options }) {
  const scrollRef = useRef(null);
  const selectedRef = useRef(null);

  useEffect(() => {
    if (!selectedRef.current || !scrollRef.current) return;
    const el = selectedRef.current;
    const container = scrollRef.current;
    const elLeft = el.offsetLeft;
    const elRight = elLeft + el.offsetWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    if (elLeft < viewLeft) {
      container.scrollTo({ left: elLeft - 22, behavior: "smooth" });
    } else if (elRight > viewRight) {
      container.scrollTo({ left: elRight - container.clientWidth + 22, behavior: "smooth" });
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
        className="no-scrollbar mt-3"
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          overscrollBehaviorX: "contain",
          touchAction: "pan-x",
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: 30,
          paddingBottom: 30,
        }}
      >
        <div className="flex gap-3">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                ref={isSelected ? selectedRef : null}
                type="button"
                onClick={() => onChange(option.value)}
                className="flex shrink-0 items-center justify-center rounded-full border text-center"
                style={{
                  height: 88,
                  width: 88,
                  transition: TRANSITION,
                  borderColor: isSelected ? "rgba(91,168,138,0.65)" : "rgba(255,255,255,0.10)",
                  background: isSelected
                    ? "linear-gradient(145deg, rgba(91,168,138,0.20), rgba(91,163,184,0.10))"
                    : "rgba(255,255,255,0.03)",
                  boxShadow: isSelected
                    ? "0 0 0 1px rgba(91,168,138,0.30), 0 0 20px rgba(91,168,138,0.30), inset 0 1px 1px rgba(255,255,255,0.10)"
                    : "inset 0 1px 1px rgba(255,255,255,0.04)",
                  color: isSelected ? "rgba(255,255,255,0.97)" : "rgba(255,255,255,0.60)",
                }}
                aria-pressed={isSelected}
              >
                <span className="px-1.5 text-[11px] font-semibold leading-tight">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}