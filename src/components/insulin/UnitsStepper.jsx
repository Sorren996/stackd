import { Minus, Plus } from "lucide-react";

const PRESETS = [5, 10, 15, 20];

const TRANSITION = "border-color 250ms ease-out, background 250ms ease-out, box-shadow 250ms ease-out, color 250ms ease-out";

const ACTION_BTN_STYLE = {
  borderColor: "rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.85)",
  transition: "transform 120ms ease-out, opacity 120ms ease-out",
};

/**
 * Touch-first unit selector for insulin logging.
 * A large central stepper gives ±1 unit precision; quick presets
 * below it act as shortcuts that set the dose exactly. No keyboard.
 *
 * The +/- buttons are neutral ACTION buttons — a subtle scale press
 * only, never a persistent glow. Only the dose value and the matching
 * preset carry a persistent selected state, transitioned smoothly.
 */
export default function UnitsStepper({ value, onChange }) {
  const current = Number(value) || 0;

  const setUnits = (next) => {
    const clamped = Math.max(0, Math.round(next));
    onChange(clamped > 0 ? String(clamped) : "");
  };

  return (
    <div>
      <span className="stackd-section-label">Units</span>

      {/* Central stepper — primary dose display */}
      <div className="mt-3 flex items-center justify-center gap-5" style={{ padding: "18px 0" }}>
        <button
          type="button"
          onClick={() => setUnits(current - 1)}
          disabled={current <= 0}
          className="flex h-12 w-12 items-center justify-center rounded-full border active:scale-95 disabled:opacity-30"
          style={ACTION_BTN_STYLE}
          aria-label="Decrease dose by 1 unit"
        >
          <Minus className="h-5 w-5" />
        </button>

        <div className="flex min-w-[104px] items-baseline justify-center gap-1">
          <span className="text-4xl font-black leading-none text-white">{current}</span>
          <span className="text-sm font-medium text-white/45">U</span>
        </div>

        <button
          type="button"
          onClick={() => setUnits(current + 1)}
          className="flex h-12 w-12 items-center justify-center rounded-full border active:scale-95"
          style={ACTION_BTN_STYLE}
          aria-label="Increase dose by 1 unit"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Quick presets — shortcuts beneath the total */}
      <div
        className="no-scrollbar"
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          overscrollBehaviorX: "contain",
          touchAction: "pan-x",
          paddingLeft: 22,
          paddingRight: 22,
          paddingTop: 22,
          paddingBottom: 22,
        }}
      >
        <div className="flex justify-center gap-2">
          {PRESETS.map((preset) => {
            const isSelected = current === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setUnits(preset)}
                className="flex shrink-0 items-center justify-center rounded-full border text-sm font-semibold"
                style={{
                  height: 44,
                  minWidth: 56,
                  transition: TRANSITION,
                  borderColor: isSelected ? "rgba(91,168,138,0.60)" : "rgba(255,255,255,0.10)",
                  background: isSelected
                    ? "linear-gradient(145deg, rgba(91,168,138,0.20), rgba(91,163,184,0.12))"
                    : "rgba(255,255,255,0.03)",
                  boxShadow: isSelected
                    ? "0 0 0 1px rgba(91,168,138,0.25), 0 0 18px rgba(91,168,138,0.28), inset 0 1px 1px rgba(255,255,255,0.10)"
                    : "inset 0 1px 1px rgba(255,255,255,0.04)",
                  color: isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.62)",
                }}
                aria-pressed={isSelected}
              >
                {preset}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}