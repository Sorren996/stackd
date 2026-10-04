import { Minus, Plus } from "lucide-react";

// ── Field component kit for the shared log/edit forms ─────────────────────
// Native-feel inputs with locked spacing enforced by the shell (24px side
// padding, 56px field height, 16px gaps between field blocks).
//
// Palette: cream cards, copper accent, espresso ink, taupe/faint muted labels
// (all WCAG AA ≥ 4.5:1 on cream).

const INK = "#3f3830";
const COPPER = "#9c5228";
const TAUPE = "#6b6153";
const FAINT = "#746959";
const CREAM = "#fdf9f2";
const CANVAS = "#f7f1e8";
const HAIRLINE = "#eadccf";

function FieldLabel({ children }) {
  return (
    <span
      style={{
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        fontWeight: 700,
        fontSize: "10px",
        color: FAINT,
      }}
    >
      {children}
    </span>
  );
}

// ── Large −/+ numeric stepper ──────────────────────────────────────────────
// Locked 56px field height, large central value, − / + buttons. Optional
// `unit` suffix and `step` (default 1). Presets row optional via `presets`.
export function StepperField({ label, value, onChange, unit, step = 1, presets, min = 0 }) {
  const current = Number(value) || 0;
  const set = (next) => {
    const clamped = Math.max(min, next);
    onChange(clamped > 0 ? String(clamped) : "");
  };

  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <div
        className="flex items-center justify-between"
        style={{ height: "56px", marginTop: label ? "10px" : 0 }}
      >
        <button
          type="button"
          onClick={() => set(current - step)}
          disabled={current <= min}
          className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95 disabled:opacity-30"
          style={{ background: CANVAS, color: INK }}
          aria-label={`Decrease ${label || "value"} by ${step}`}
        >
          <Minus className="h-5 w-5" />
        </button>

        <div className="flex min-w-[100px] items-baseline justify-center gap-1">
          <span className="text-4xl font-black leading-none" style={{ color: INK, fontVariantNumeric: "tabular-nums" }}>
            {current}
          </span>
          {unit && <span className="text-sm font-medium" style={{ color: FAINT }}>{unit}</span>}
        </div>

        <button
          type="button"
          onClick={() => set(current + step)}
          className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95"
          style={{ background: CANVAS, color: INK }}
          aria-label={`Increase ${label || "value"} by ${step}`}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {presets && presets.length > 0 && (
        <div className="no-scrollbar mt-4" style={{ overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
          <div className="flex justify-center gap-2">
            {presets.map((preset) => {
              const isSelected = current === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => set(preset)}
                  className="flex shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={{
                    height: 44,
                    minWidth: 56,
                    transition: "background 200ms ease-out, color 200ms ease-out",
                    background: isSelected ? COPPER : CANVAS,
                    color: isSelected ? CREAM : TAUPE,
                  }}
                  aria-pressed={isSelected}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Segmented control — for type choices (insulin types, etc.) ─────────────
// Renders a horizontal scroll of segments; selected = copper. Each segment
// shows an optional color dot (for insulin profiles) + label.
export function SegmentedControl({ label, value, onChange, options, ariaLabel }) {
  if (!options.length) {
    return (
      <div>
        {label && <FieldLabel>{label}</FieldLabel>}
        <p className="mt-2 text-xs" style={{ color: FAINT }}>
          Add types in Settings to log an entry.
        </p>
      </div>
    );
  }

  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <div
        className="no-scrollbar"
        style={{
          marginTop: label ? "10px" : 0,
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "none",
          overscrollBehaviorX: "contain",
        }}
      >
        <div className="flex gap-2">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className="flex shrink-0 items-center gap-2 rounded-full text-sm font-semibold"
                style={{
                  height: "44px",
                  padding: "0 16px",
                  transition: "background 200ms ease-out, color 200ms ease-out",
                  background: isSelected ? COPPER : CANVAS,
                  color: isSelected ? CREAM : TAUPE,
                }}
                aria-pressed={isSelected}
                aria-label={ariaLabel ? `${ariaLabel}: ${option.label}` : option.label}
              >
                {option.color && (
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "9999px",
                      background: option.color,
                      boxShadow: isSelected ? "0 0 0 2px rgba(247,241,232,0.85)" : "0 0 0 1px rgba(63,56,48,0.10)",
                    }}
                  />
                )}
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Time field with a "Now" shortcut chip ──────────────────────────────────
// Combines a native date input + native time input, plus a "Now" chip that
// snaps both to the current moment. 56px row height.
export function TimeField({ dateLabel = "Date", timeLabel = "Time", dateValue, timeValue, onDateChange, onTimeChange, maxDate, maxTime }) {
  const setNow = () => {
    const now = new Date();
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    onDateChange(d);
    onTimeChange(t);
  };

  const inputClass = "w-full rounded-2xl px-4 text-base font-medium";
  const inputStyle = {
    height: "56px",
    background: CANVAS,
    color: INK,
    border: "none",
    outline: "none",
  };

  return (
    <div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <FieldLabel>{dateLabel}</FieldLabel>
          <input
            type="date"
            value={dateValue}
            max={maxDate}
            onChange={(e) => onDateChange(e.target.value)}
            className={`${inputClass} mt-2`}
            style={inputStyle}
          />
        </div>
        <div className="flex-1">
          <FieldLabel>{timeLabel}</FieldLabel>
          <input
            type="time"
            value={timeValue}
            max={maxTime}
            onChange={(e) => onTimeChange(e.target.value)}
            className={`${inputClass} mt-2`}
            style={inputStyle}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={setNow}
        className="mt-3 flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold"
        style={{ height: "36px", background: "rgba(156,82,40,0.12)", color: COPPER }}
      >
        Now
      </button>
    </div>
  );
}

// ── Text field — optional notes / name ─────────────────────────────────────
// Single-line or multiline, 56px height (multiline grows).
// Placeholder color is WCAG AA (TAUPE #6b6153 ≈ 5.4:1 on canvas).
export function TextField({ label, value, onChange, placeholder, multiline = false }) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-2xl px-4 pt-3.5 text-base font-medium"
          style={{
            marginTop: label ? "10px" : 0,
            background: CANVAS,
            color: INK,
            border: "none",
            outline: "none",
            resize: "none",
            minHeight: "56px",
          }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl px-4 text-base font-medium"
          style={{
            height: "56px",
            marginTop: label ? "10px" : 0,
            background: CANVAS,
            color: INK,
            border: "none",
            outline: "none",
          }}
        />
      )}
    </div>
  );
}

// ── Rescue-carbs toggle — for the meal form ───────────────────────────────
export function RescueCarbToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-2xl px-4"
      style={{ height: "56px", background: CANVAS }}
      aria-pressed={checked}
    >
      <span className="text-sm font-medium" style={{ color: INK }}>
        Rescue carbs
      </span>
      <span
        className="flex items-center justify-center rounded-full transition"
        style={{
          width: "48px",
          height: "28px",
          background: checked ? COPPER : "#d8cec2",
          transition: "background 200ms ease-out",
        }}
      >
        <span
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "9999px",
            background: CREAM,
            transform: checked ? "translateX(11px)" : "translateX(-11px)",
            transition: "transform 200ms ease-out",
          }}
        />
      </span>
    </button>
  );
}

export { FieldLabel, INK, COPPER, TAUPE, FAINT, CREAM, CANVAS, HAIRLINE };