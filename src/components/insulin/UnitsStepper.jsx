import { Minus, Plus } from "lucide-react";

const PRESETS = [5, 10, 15, 20];

/**
 * Touch-first unit selector for insulin logging.
 * A large central stepper gives ±1 unit precision; quick presets
 * below it act as shortcuts that set the dose exactly. No keyboard.
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
      <div className="mt-3 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => setUnits(current - 1)}
          disabled={current <= 0}
          className="flex h-12 w-12 items-center justify-center rounded-full border transition-colors disabled:opacity-30"
          style={{
            borderColor: "rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.85)",
          }}
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
          className="flex h-12 w-12 items-center justify-center rounded-full border transition-colors"
          style={{
            borderColor: "rgba(91,168,138,0.35)",
            background: "linear-gradient(145deg, rgba(91,168,138,0.18), rgba(91,163,184,0.10))",
            boxShadow: "0 6px 18px rgba(91,168,138,0.16), inset 0 1px 1px rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.95)",
          }}
          aria-label="Increase dose by 1 unit"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Quick presets — shortcuts beneath the total */}
      <div
        className="no-scrollbar mt-4 flex justify-center gap-2 overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        {PRESETS.map((preset) => {
          const isSelected = current === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => setUnits(preset)}
              className="flex shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors"
              style={{
                height: 44,
                minWidth: 56,
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
              {preset}
            </button>
          );
        })}
      </div>
    </div>
  );
}