import { Minus, Plus } from "lucide-react";

const PRESETS = [5, 10, 15, 20];

const TRANSITION = "border-color 250ms ease-out, background 250ms ease-out, color 250ms ease-out";

const ACTION_BTN_STYLE = {
  background: "#f7f1e8",
  color: "#3f3830",
  transition: "transform 120ms ease-out, opacity 120ms ease-out",
};

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
      <div className="mt-3 flex items-center justify-center gap-5" style={{ padding: "18px 0" }}>
        <button
          type="button"
          onClick={() => setUnits(current - 1)}
          disabled={current <= 0}
          className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95 disabled:opacity-30"
          style={ACTION_BTN_STYLE}
          aria-label="Decrease dose by 1 unit"
        >
          <Minus className="h-5 w-5" />
        </button>

        <div className="flex min-w-[104px] items-baseline justify-center gap-1">
          <span className="text-4xl font-black leading-none" style={{ color: "#3f3830" }}>{current}</span>
          <span className="text-sm font-medium" style={{ color: "#a89e8d" }}>U</span>
        </div>

        <button
          type="button"
          onClick={() => setUnits(current + 1)}
          className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95"
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
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: 28,
          paddingBottom: 28,
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
                className="flex shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                style={{
                  height: 44,
                  minWidth: 56,
                  transition: "background 250ms ease-out, color 250ms ease-out",
                  background: isSelected ? "#9c5228" : "#f7f1e8",
                  color: isSelected ? "#f7f1e8" : "#8a7f70",
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